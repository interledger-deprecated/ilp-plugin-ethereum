'use strict'

const Web3 = require('web3')
const EventEmitter = require('events')
const debug = require('debug')('plugin')

class PluginEthereum extends EventEmitter {
  
  constructor (opts) {
    super()

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
    this.contractClass = this.web3.eth.contract(this.abi)
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
        this._log("got submitted: ", error, result)
        if (error) {
          reject(error)  
        } else {
          this._log('Fulfill TX Hash:', result)
          this._waitForReceipt(result)
            .then(() => {
              this._log('got receipt for TX')
              resolve()
            })
        }
      }

      const result = this.contract.fulfillTransfer.sendTransaction(
        transferId,                                      // uuid
        this.web3.toHex(fulfillment),                    // data
        {
          from: this.web3.eth.coinbase,
        },
        handle
      )
    })
  }

  getBalance () {
    if (!this.web3) {
      return Promise.reject(new Error('must be connected'))
    }

    this._log('getting the balance')
    return new Promise((resolve) => {
      const balance = this.web3.eth.getBalance(this.web3.eth.coinbase)
      resolve(balance.toString(10))
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
      value: this.web3.toWei(outgoingTransfer.amount, 'ether'),
      /* data: this.web3.toHex(outgoingTransfer.data) */
      // TODO?: will this need to include gas prices?
    }
    this._log('sending a transfer')
    
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
              this.emit('outgoing_transfer', transfer)
            })
          resolve()
        }
      })
    })
  }

  _sendUniversal (outgoingTransfer) {
    if (!this.web3) {
      return Promise.reject(new Error('must be connected'))
    }

    return new Promise((resolve, reject) => {
      const handle = (error, result) => {
        this._log("got submitted: ", error, result)
        if (error) {
          reject(error)
        } else {
          this._log('Universal TX Hash:', result)

          this._waitForReceipt(result)
            .then(() => {
              this._log('universal transaction mined')
              resolve()
            })

//         try {
//            console.log('running')
//            this.contract.allEvents().watch(/*{ uuid: outgoingTransfer.id },*/ (err, result) => {
//              this._log('got error:  ', err, '\n    result: ', result)
//              // err ? reject(err):resolve(result)
//            })
//          } catch (e) { console.error(e) }
        }
      }

      this._log(JSON.stringify([
        outgoingTransfer.account,                                  // receiver
        //this._conditionToHex(outgoingTransfer.executionCondition), // condition
        this.web3.toHex(outgoingTransfer.executionCondition),
        outgoingTransfer.id,                                       // uuid
        //this._dateToTimestamp(outgoingTransfer.expiry),            // expiry
        this.web3.toHex(outgoingTransfer.expiry),
        this.web3.toHex(outgoingTransfer.data),                    // data
        {
          from: this.web3.eth.coinbase,
          gas: 300000, // TODO?: specify this?
          value: this.web3.toWei(outgoingTransfer.amount, 'ether')
        }
      ], null, 2))

      const result = this.contract.createTransfer.sendTransaction(
        outgoingTransfer.account,                                  // receiver
        this.web3.toHex(outgoingTransfer.executionCondition),
        outgoingTransfer.id,                                       // uuid
        this.web3.toHex(outgoingTransfer.expiry),
        this.web3.toHex(outgoingTransfer.data),                    // data
        {
          from: this.web3.eth.coinbase,
          value: this.web3.toWei(outgoingTransfer.amount, 'ether'),
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
  
  _handleUpdate (event) {
    // TODO: what is this event made of?
    this._log(JSON.stringify(event))
  }

  _log () {
    debug(...arguments)
  }
}

module.exports = PluginEthereum
