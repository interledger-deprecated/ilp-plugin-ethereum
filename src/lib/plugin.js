'use strict'

const IlpPacket = require('ilp-packet')
const base64url = require('base64url')
const Web3 = require('web3')
const EventEmitter2 = require('eventemitter2')
const debug = require('debug')('ilp-plugin-ethereum')
const HttpRpc = require('../model/rpc')
const co = require('co')
const Ethereum = require('../model/ethereum')

const uuid4 = require('node-uuid')

class PluginEthereum extends EventEmitter2 {

  constructor (opts) {
    super()

    this.provider = opts.provider // http address for web3 provider
    this.address = opts.address

    // this can't be done on ethereum
    this.notesToSelf = {}

    // set up RPC if peer supports it
    this._rpc = new HttpRpc(this)
    this._rpc.addMethod('send_message', this._handleSendMessage)
    this._rpc.addMethod('send_request', this._handleRequest)
    this._rpcUris = opts.rpcUris || {}
    this.isAuthorized = () => true
    this.receive = co.wrap(this._rpc._receive).bind(this._rpc)

    // information about ethereum contract
    this.contractAddress = opts.contract
    this._prefix = 'g.crypto.ethereum.'
    this.web3 = null // local web3 instance
  }

  registerRequestHandler (handler) {
    if (this._requestHandler) {
      throw new Error('requestHandler is already registered')
    }

    if (typeof handler !== 'function') {
      throw new Error('requestHandler must be a function')
    }

    this._requestHandler = handler
  }

  deregisterRequestHandler () {
    this._requestHandler = null
  }

  async sendRequest (message) {
    this.emitAsync('outgoing_request', message)

    const response = await this._rpc.call('send_request', this._prefix, [message])
    this.emitAsync('incoming_response', response)

    return response
  }

  async _handleRequest (message) {
    this.emitAsync('incoming_request', message)

    if (!this._requestHandler) {
      throw new NotAcceptedError('no request handler registered')
    }

    const response = await this._requestHandler(message)
      .catch((e) => ({
        ledger: message.ledger,
        to: message.from,
        from: this.getAccount(),
        ilp: base64url(IlpPacket.serializeIlpError({
          code: 'F00',
          name: 'Bad Request',
          triggeredBy: this.getAccount(),
          forwardedBy: [],
          triggeredAt: new Date(),
          data: JSON.stringify({ message: e.message })
        }))
      }))

    this.emitAsync('outgoing_response', response)

    return response
  }

  // used when peer has enabled rpc
  async _handleSendMessage (message) {
    // TODO: validate message
    this.emitAsync('incoming_message', message)
    return true
  }

  // lookup RPC for messaging, because on-ledger is too slow
  async sendMessage (message) {
    if (!this.web3) throw new Error('must be connected')

    if (this._rpcUris[message.to]) {
      await this._rpc.call(
        this._rpcUris[message.to],
        'send_message', this._prefix, [message])

      this.emitAsync('outgoing_message', message)
    } else {
      throw new Error('no RPC address for account', message.to)
    }
  }

  getAccount () {
    return this._prefix + this.address
  }

  getInfo () {
    return {
      prefix: 'g.crypto.ethereum.',
      currencyCode: 'ETH',
      currencyScale: 9,
      connectors: []
    }
  }

  async connect () {
    if (this.web3) return

    debug('creating web3 instance')
    this.web3 = new Web3(new Web3.providers.HttpProvider(this.provider))
    debug('creating contract instance')
    this.contract = Ethereum.getContract(this.web3, this.contractAddress)

    debug('registering Debug event handler')
    Ethereum.onEvent(this.contract, 'Debug', (result) => {
      debug('Debug event:', result.args.msg)
    })

    debug('registering DebugInt event handler')
    Ethereum.onEvent(this.contract, 'DebugInt', (result) => {
      console.log('DebugInt event:', result.args.msg, result.args.num)
    })

    const that = this
    debug('registering Fulfill event handler')
    Ethereum.onEvent(this.contract, 'Fulfill', async function (result) {
      const { uuid, fulfillment, fulfillmentData } = result.args

      const transfer = (await Ethereum.getTransfer(that.contract, uuid))
        .map((e) => e.toString())
      const memo = base64url(Buffer
        .from((await Ethereum.getMemo(that.contract, uuid)).slice(2), 'hex'))

      debug('result of Fulfill:', transfer, memo)

      const unparsedId = uuid4.unparse(Buffer.from(uuid.substring(2), 'hex'))
      that._processUpdate({
        id: unparsedId,
        from: Ethereum.hexToAccount(that._prefix, transfer[0]),
        to: Ethereum.hexToAccount(that._prefix, transfer[1]),
        amount: that.web3.fromWei(transfer[2], 'gwei'),
        ilp: memo,
        executionCondition: base64url(Buffer.from(transfer[3].slice(2), 'hex')),
        noteToSelf: JSON.parse(that.notesToSelf[unparsedId] || null),
        expiresAt: (new Date(+transfer[4] * 1000)).toISOString(),
        state: 'fulfill'
      }, base64url(Buffer.from(fulfillment.slice(2), 'hex')),
        base64url(Buffer.from(fulfillmentData.slice(2), 'hex')))
    })

    // TODO: merge Update and Fulfill
    debug('registering Update event handler')
    Ethereum.onEvent(this.contract, 'Update', async function (result) {
      const { uuid, fulfillment } = result.args

      const transfer = (await Ethereum.getTransfer(that.contract, uuid))
        .map((e) => e.toString())
      const memo = base64url(Buffer
        .from((await Ethereum.getMemo(that.contract, uuid)).slice(2), 'hex'))

      debug('result of Update:', transfer, memo)

      const unparsedId = uuid4.unparse(Buffer.from(uuid.substring(2), 'hex'))
      that._processUpdate({
        id: unparsedId,
        from: Ethereum.hexToAccount(that._prefix, transfer[0]),
        to: Ethereum.hexToAccount(that._prefix, transfer[1]),
        amount: that.web3.fromWei(transfer[2], 'gwei'),
        ilp: memo,
        executionCondition: base64url(Buffer.from(transfer[3].slice(2), 'hex')),
        noteToSelf: JSON.parse(that.notesToSelf[unparsedId] || null),
        expiresAt: (new Date(+transfer[4] * 1000)).toISOString(),
        state: Ethereum.stateToName(transfer[5])
      })
    })

    // TODO: find out how to be notified of connect
    debug('finished')
    this.emitAsync('connect')

    return null
  }

  _processUpdate (transfer, fulfillment, fulfillmentData) {
    let direction

    // TODO: make this more concise 
    debug('I AM ' + this.getAccount())
    debug('transfer is: ' + JSON.stringify(transfer, null, 2))
    debug('eq?', this.getAccount() === transfer.from)

    if (transfer.from === this.getAccount()) direction = 'outgoing'
    if (transfer.to === this.getAccount()) direction = 'incoming'
    if (!direction) return

    transfer.direction = direction
    transfer.ledger = this._prefix

    debug('emitting ' + direction + '_' + transfer.state)
    debug('transfer is: ' + JSON.stringify(transfer, null, 2))
    if (transfer.state === 'fulfill') {
      debug('emitting the fulfill')
      this.emit(direction + '_' + transfer.state, transfer, fulfillment, fulfillmentData)
      return
    }
    this.emit(direction + '_' + transfer.state, transfer)
  }

  disconnect () {
    if (!this.web3) return
    // TODO: find out how to actually disconnect
    this.web3 = null

    this.emit('disconnect')
    return Promise.resolve(null)
  }

  isConnected () {
    return !!this.web3
  }

  async fulfillCondition (transferId, fulfillment, fulfillmentData) {
    console.log('transferId:', transferId)
    const hash = await Ethereum.fulfillCondition(this.contract, {
      address: this.address,
      uuid: transferId,
      fulfillment,
      fulfillmentData
    })

    await Ethereum.waitForReceipt(this.web3, hash)
    debug('fulfill transaction mined')
  }

  async getBalance () {
    if (!this.web3) throw new Error('must be connected')

    // TODO: better number conversion
    debug('getting the balance')
    const [ , balance ] = this.web3.eth.getBalance(this.address)
      .match(/^(.+)\d{9}/) || [ , '0' ]

    return balance
  }

  async sendTransfer (_transfer) {
    if (!this.web3) throw new Error('must be connected')
    const transfer = Object.assign({ from: this.address }, _transfer)
    const hash = await Ethereum.sendTransfer(this.contract, transfer,
      this.web3)

    debug('awaiting receipt for transfer with id', transfer.id)
    await Ethereum.waitForReceipt(this.web3, hash)
    this.notesToSelf[transfer.id] = JSON.stringify(transfer.noteToSelf)
    debug('send transaction mined')
  }
}

module.exports = PluginEthereum
