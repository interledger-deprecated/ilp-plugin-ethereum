'use strict'

const base64url = require('base64url')
const Web3 = require('web3')
const EventEmitter = require('events')
const debug = require('debug')('ilp-plugin-ethereum')
const uuid4 = require('node-uuid')

class PluginEthereum extends EventEmitter {

  constructor (opts) {
    super()

    this.provider = opts.provider // http address for web3 provider
    this.address = opts.address

    // this can't be done on ethereum
    this.notesToSelf = {}

    // set up RPC if peer supports it
    this._rpc = new HttpRpc(this)
    this._rpc.addMethod('send_message', this._handleSendMessage)
    this.isAuthorized = () => true
    this.receive = co.wrap(this._rpc._receive).bind(this._rpc)

    // information about ethereum contract
    this.contractAddress = opts.contract
    this._prefix = 'g.crypto.etherum.'
    this.web3 = null // local web3 instance
  }

  // used when peer has enabled rpc
  async _handleSendMessage (message) {
    // TODO: validate message
    this.emitAsync('incoming_message', message)
    return true
  }

  // lookup RPC for messaging, because on-ledger is too slow
  async sendMessage (message) {
    assert(this._connected, 'plugin must be connected before sendMessage')

    if (this._rpcUris[message.to]) {
      await this._rpc.call(
        this._rpcUris[message.to],
        'send_message', this._prefix, [message])

      this.emitAsync('outgoing_message', _message)
    } else {
      throw new Error('no RPC address for account', message.to)
    }
  }

  getAccount () {
    return this._preifx + address
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

    this.web3 = new Web3(new Web3.providers.HttpProvider(this.provider))
    this.contract = Ethereum.getContract(this.web3, this.contractAddress)

    Ethereum.onEvent(this.contract, 'Debug', (result) => {
      debug('Debug event:', result.args.msg)
    })

    Ethereum.onEvent(this.contract, 'DebugInt', (result) => {
      console.log('DebugInt event:', result.args.msg, result.args.num)
    })

    const that = this
    Ethereum.onEvent(this.contract, 'Fulfill', async function (result) {
      const { uuid, fulfillment } = result.args

      const transfer = (await Ethereum.getTransfer(that.contract, uuid))
        .map((e) => e.toString())
      const memo = Buffer
        .from((await Ethereum.getMemo(that.contract, uuid)).slice(2))
        .toString('base64')

      this._processUpdate({
        id: uuid4.unparse(Buffer.from(uuid.substring(2), 'hex')),
        from: this._toAccount(res[0]),
        to: this._toAccount(res[1]),
        amount: this.web3.fromWei(res[2]),
        data: data,
        executionCondition: 'cc:0:3:' + base64url(Buffer.from(res[3].slice(2), 'hex')) + ':32',
        noteToSelf: JSON.parse(this.notesToSelf[uuid] || null),
        expiresAt: (new Date(+res[4] * 1000)).toISOString(),
        state: 'fulfill'
      }, 'cf:0:' + base64url(Buffer.from(fulfillment.slice(2), 'hex')))
    })

    // TODO: merge Update and Fulfill
    Ethereum.onEvent(this.contract, 'Update', async function (result) {
      const { uuid, fulfillment } = result.args

      const transfer = (await Ethereum.getTransfer(that.contract, uuid))
        .map((e) => e.toString())
      const memo = Buffer
        .from((await Ethereum.getMemo(that.contract, uuid)).slice(2))
        .toString('base64')

      this._processUpdate({
        id: uuid4.unparse(Buffer.from(uuid.substring(2), 'hex')),
        from: this._toAccount(res[0]),
        to: this._toAccount(res[1]),
        amount: this.web3.fromWei(res[2]),
        data: data,
        executionCondition: 'cc:0:3:' + base64url(Buffer.from(res[3].slice(2), 'hex')) + ':32',
        noteToSelf: JSON.parse(this.notesToSelf[uuid] || null),
        expiresAt: (new Date(+res[4] * 1000)).toISOString(),
        state: Ethereum.stateToName(res[5])
      })
    })

    // TODO: find out how to be notified of connect
    this.emit('connect')
    return null
  }

  _processUpdate (transfer, fulfillment) {
    let direction

    // TODO: make this more concise 
    debug('I AM ' + this.getAccount())
    debug('transfer is: ' + JSON.stringify(transfer, null, 2))
    debug('eq?', this.getAccount() === transfer.from)

    if (transfer.from === this.getAccount()) direction = 'outgoing'
    if (transfer.to === this.getAccount()) direction = 'incoming'
    if (!direction) return

    transfer.direction = direction

    debug('emitting ' + direction + '_' + transfer.state)
    debug('transfer is: ' + JSON.stringify(transfer, null, 2))
    if (transfer.state === 'fulfill') {
      debug('emitting the fulfill')
      this.emit(direction + '_' + transfer.state, transfer, fulfillment)
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

  async fulfillCondition (transferId, fulfillment) {
    console.log('transferId:', transferId)
    const hash = await Ethereum.fulfillCondition(this.contract, {
      address: this._address,
      uuid: transferId,
      fulfillment
    })

    await waitForReceipt(this.web3, hash)
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
    const transfer = Object.assign({ from: this._account }, _transfer)
    const hash = await Ethereum.sendTransfer(this.contract, transfer)

    await Ethereum.waitForReceipt(this.web3, hash)
    this.notesToSelf[uuid] = JSON.stringify(transfer.noteToSelf)
    debug('send transaction mined')
  }
}

module.exports = PluginEthereum
