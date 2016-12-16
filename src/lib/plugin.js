'use strict'

const Web3 = require('web3')
const EventEmitter = require('events')
const debug = require('debug')('ilp-plugin-ethereum')
const uuid4 = require('uuid4')

const Provider = require('../model/provider')

class PluginEthereum extends EventEmitter {
  
  constructor (opts) {
    super()

    if (typeof opts.provider !== 'string') {
      throw new Error('opts.provider must be a string')
    } else if (typeof opts.account !== 'string') {
      throw new Error('opts.provider must be a string')
    } else if (opts.prefix && typeof opts.prefix !== 'string') {
      throw new Error('opts.prefix must be a string')
    }

    this.debugId = uuid4()
    this.provider = opts.provider // http address for web3 provider
    this.prefix = opts.prefix || 'ethereum.' // ILP prefix
    this.ownAccount = opts.account
    this.seenTransactions = {}
    this.seenBlocks = {}

    this.web3 = null // local web3 instance
  }

  connect () {
    if (this.web3) return
    this.web3 = new Web3(Provider(this.provider))

    const filter = this.web3.eth.filter('latest')
    filter.watch((e, r) => { this._listenBlocks(e, r) })

    // TODO: find out how to be notified of connect
    this.emit('connect')
    return Promise.resolve(null)
  }

  disconnect () {
    if (!this.web3) return
    // TODO: find out how to actually disconnect
    this.web3 = null
    
    this.emit('disconnect')
    return Promise.resolve(null)
  }

  getPrefix () {
    return Promise.resolve(this.prefix)
  }

  getAccount () {
    return Promise.resolve(this.prefix + this.ownAccount)
  }

  getInfo () {
    return {
      precision: 10,
      scale: 10
    }
  }

  isConnected () {
    return !!this.web3
  }

  sendTransfer (outgoingTransfer) {
    return outgoingTransfer.executionCondition
      ? this._sendUniversal(outgoingTransfer)
      : this._sendOptimistic(outgoingTransfer)
  }

  getBalance () {
    if (!this.web3) {
      return Promise.reject(new Error('must be connected'))
    }

    this._log('getting the balance')
    return new Promise((resolve) => {
      const balance = this.web3.eth.getBalance(this.ownAccount)
      resolve(balance.toString(10))
    })
  }

  _sendOptimistic (outgoingTransfer) {
    if (!this.web3) {
      return Promise.reject(new Error('must be connected'))
    } else if (outgoingTransfer.amount < 0) {
      return Promise.reject(new Error('amount must be greater than or equal to 0'))
    }

    const splitAddress = outgoingTransfer.account.split('.')
    const localAccount = splitAddress[splitAddress.length - 1]

    // TODO?: forbid repeat IDs?
    const transfer = {
      from: this.ownAccount,
      to: localAccount,
      value: this.web3.toWei(outgoingTransfer.amount, 'ether'),
      data: this.web3.toHex(JSON.stringify({
        id: outgoingTransfer.id,
        data: outgoingTransfer.data
      }))
    }
    this._log('sending a transfer:', JSON.stringify(transfer, null, 2))
    
    return new Promise((resolve, reject) => {
      this.web3.eth.sendTransaction(transfer, (error, result) => {
        this._log('got err:', error, '\n    and result:', result)
        if (error) {
          reject(error)
        } else {
          this._log('Optimistic TX Hash:', result)
          this._waitForReceipt(result)
            .then(() => {
              this._log('wait for receipt complete')
//              this.emit('outgoing_transfer', outgoingTransfer)
            })
          resolve()
        }
      })
    })
  }

  _listen () {
    const filter = this.web3.eth.filter({
      address: this.contractAddress,
      topics: [this.web3.coinbase]
    })
    filter.watch((error, result) => {
      if (error) this._log(error)
      this._handleUpdate(result)
    })
  }

  _waitForReceipt(hash) {
    return new Promise((resolve) => {
      const that = this
      const pollReceipt = () => {
        try {
          if (that.web3.eth.getTransactionReceipt(hash)) {
            this._log('got receipt on', hash)
            resolve()
          } else {
            setTimeout(pollReceipt, 500)
          }
        } catch (error) {
          this._log('ERROR:', error) 
        }
      }

      pollReceipt()
    })
  }

  _handleTransaction (error, transaction, web3) {
    if (error) {
      this._log(error)
      return
    }

    if (this.seenTransactions[transaction.hash]) {
      return
    }
    this.seenTransactions[transaction.hash] = true

    let metadata
    try {
      metadata = JSON.parse(web3.toAscii(transaction.input))
    } catch (e) {
      this._log('error parsing transaction input. make sure it\'s json converted to hex')
      return
    }

    const transfer = {
      id: metadata.id,
      amount: web3.fromWei(transaction.value, 'ether').toString(),
      ledger: this.prefix,
      data: metadata.data
    }

    if (transaction.to === this.ownAccount) {
      this._log('transfer incoming. id:', transfer.id)
      this.emit('incoming_transfer',
        Object.assign({account: this.prefix + transaction.from}, transfer))
    } else if (transaction.from === this.ownAccount) {
      this._log('transfer outgoing. id:', transfer.id)
      this.emit('outgoing_transfer',
        Object.assign({account: this.prefix + transaction.to}, transfer))
    }
  }

  _listenBlocks (error, result) {
    if (!this.web3) return
    if (error) {
      this._log(error)
      return
    }

    // web3 must be copied in case the plugin is disconnected midway through
    // this function and this.web3 becomes undefined.
    const web3 = this.web3
    const block = web3.eth.getBlock(result)

    if (this.seenBlocks[block.number]) {
      return
    }
    this.seenBlocks[block.number] = true

    this._log('filter got block #' + block.number)
    web3.eth.getBlockTransactionCount(block.number, (e, count) => {
      if (e) throw e
      this._log('has', count, 'transactions.')

      // get all transactions on the block by index
      for (let i = 0; i < count; i++) {
        web3.eth.getTransactionFromBlock(
          block.number,
          i,
          (e, r) => { this._handleTransaction(e, r, web3) }
        )
      }
    })
  }

  _handleUpdate (event) {
    // TODO: what is this event made of?
    this._log(JSON.stringify(event))
  }

  _log () {
    debug(this.debugId, ...arguments)
  }
}

module.exports = PluginEthereum
