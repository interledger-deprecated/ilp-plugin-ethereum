'use strict'

const Web3 = require('web3')

class PluginEthereum {
  
  constructor (opts) {
    this.provider = opts.provider // http address for web3 provider

    // information about ethereum contract
    this.contractAddress = opts.contract
    this.abi = opts.abi // contract abi json

    this.web3 = null // local web3 instance
  }

  connect () {
    if (this.web3) return
    this.web3 = new Web3(new Web3.providers.HttpProvider(this.provider))

    // connect to the contract
    this.contractClass = web3.eth.contract(this.abi)
    this.contract = this.contractClass.at(this.contractAddress)

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

  isConnected () {
    return !!this.web3
  }

  send (outgoingTransfer) {
    return outgoingTransfer.executionCondition
      ? this._sendUniversal(outgoingTransfer)
      : this._sendOptimistic(outgoingTransfer)
  }

  fulfillCondition (transferId, fulfillment) {
    return new Promise((resolve, reject) => {
      const handle = (error, result) => {
        if (error) {
          reject(error)  
        } else {
          // handle all the error codes
          switch (this.web3.toDecimal(result)) {
            // success
            // TODO: return these emits with the transfer
            0: this.emit('outgoing_cancel', transferId)
            1: this.emit('outgoing_fulfill', transferId)
            // failure
            -1: reject(new Error(transferId + ' doesn\'t exist'))
            -2: reject(new Error(transferId + ' is already complete'))
            -3: reject(new Error('failed to return funds to sender'))
            -4: reject(new Error('failed to send funds to receiver'))
          }
        }
      }
    })
  }

  _sendOptimistic (outgoingTransfer) {
    if (!this.web3) {
      return Promise.reject(new Error('must be connected'))
    }

    // TODO?: forbid repeat IDs?
    const transfer = {
      from: this.web3.eth.coinbase,
      to:   outgoingTransfer.account,
      value: outgoingTransfer.amount,
      data: this.web3.toHex(outgoingTransfer.data)
      // TODO?: will this need to include gas prices?
    }
    
    return new Promise((resolve, reject) => {
      this.web3.eth.sendTransaction(transfer, (error, result) => {
        if (error) reject(error)
        resolve()
      })
    })
  }

  _sendUniversal (outgoingTransfer) {
    if (!this.web3) {
      return Promise.reject(new Error('must be connected'))
    }

    return new Promise((resolve, reject) => {
      const handle = (error, result) => {
        if (error) {
          reject(error)
        } else {
          // handle all the error codes
          switch (this.web3.toDecimal(result)) {
            // success
            0: this.emit('outgoing_prepare', outgoingTransfer)
            // failure
            -1: reject(new Error('invalid uuid on transfer'))
          }
        }
      }

      const result = this.contract.call().createTransfer(
        outgoingTransfer.account,                                  // receiver
        this._conditionToHex(outgoingTransfer.executionCondition), // condition
        outgoingTransfer.id,                                       // uuid
        this._dateToTimestamp(outgoingTransfer.expiry),            // expiry
        this.web3.toHex(outgoingTransfer.data),                    // data
        {
          from: this.web3.eth.coinbase,
          gas: 300000, // TODO?: specify this?
          value: outgoingTransfer.amount
        },
        handle
      )
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
  
  _handleUpdate (event) {
    // TODO: what is this event made of?
    this._log(JSON.stringify(event))
  }

  _log () {
    console.log(...arguments)
  }
}
