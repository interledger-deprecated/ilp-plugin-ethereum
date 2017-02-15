'use strict'

const base64url = require('base64url')
const Web3 = require('web3')
const EventEmitter = require('events')
const debug = require('debug')('ilp-plugin-ethereum')
const uuid4 = require('uuid4')

const stateToName = (state) => {
  return ([ 'prepare', 'fulfill', 'cancel', 'reject' ])[state]
}

class PluginEthereum extends EventEmitter {
  
  constructor (opts) {
    super()

      foo: 'bar'
    this.debugId = uuid4()
    this.provider = opts.provider // http address for web3 provider
    this.address = opts.address

    // this can't be done on ethereum
    this.notesToSelf = {}

    // information about ethereum contract
    this.contractAddress = opts.contract
    this.abi = opts.abi // contract abi json

    this.web3 = null // local web3 instance
  }

  _toAccount (address) {
    return 'g.crypto.ethereum.' + address.toLowerCase()
  }

  getAccount () {
    return this._toAccount(this.address)
  }

  getInfo () {
    return {
      currencyCode: 'ETH',
      currencySymbol: 'ETH',
      precision: 9001,
      scale: 45023548927456
    }
  }

  connect () {
    if (this.web3) return
    this.web3 = new Web3(new Web3.providers.HttpProvider(this.provider))

    // connect to the contract
    this.contractClass = this.web3.eth.contract(this.abi)
    this.contract = this.contractClass.at(this.contractAddress)
//    console.log('CONTRACT:', this.contract)

    this.contract.Debug((error, result) => {
      if (!this.web3) return
      console.log('debug message:', result.args.msg)
    })

    this.contract.DebugInt((error, result) => {
      if (!this.web3) return
      console.log('debug message (int):', result.args.msg, result.args.num)
    })

    // listen for the events
    this.contract.Update((error, result) => {
      if (!this.web3) return
      //console.log('EVENT:', result)

      try {
//        console.log('EVENT:', result.args)
        const uuid = result.args.uuid
        const state = result.args.state
 //       console.log('uuid, state:', uuid, state)

        this.contract.transfers(uuid, (err, result) => {
          const res = result.map((e) => e.toString())
  //        console.log('\x1b[31mGot Event Result:', res)
          const memo = this.contract.memos(uuid, (err, result) => {
            let data
            try {
              data = JSON.parse(Buffer.from(result.slice(2), 'hex').toString('utf8'))
            } catch (e) {
              data = {}
            }
            console.log('\x1b[32mGot Memo:',
              JSON.parse(Buffer.from(result.slice(2), 'hex').toString('utf8') || '{}'))
  
            // parse the event and emit that
            this._processUpdate({
              id: uuid,
              from: this._toAccount(res[0]),
              to: this._toAccount(res[1]),
              amount: this.web3.fromWei(res[2]),
              data: data,
              executionCondition: 'cc:0:3:' + base64url(Buffer.from(res[3].slice(2), 'hex')) + ':32',
              noteToSelf: JSON.parse(this.notesToSelf[uuid] || null),
              expiresAt: (new Date(+res[4] * 1000)).toISOString(),
              state: stateToName(res[5]),
            })
          })
        })

      } catch (e) {}
    })

    // TODO: find out how to be notified of connect
    this.emit('connect')
    return Promise.resolve(null)
  }

  _processUpdate (transfer) {
    let direction

    debug('I AM ' + this.getAccount())
    debug('transfer is: ' + JSON.stringify(transfer, null, 2))
    debug('eq?', this.getAccount() === transfer.from)

    if (transfer.from === this.getAccount()) direction = 'outgoing_'
    if (transfer.to === this.getAccount()) direction = 'incoming_'
    if (!direction) return

    debug('emitting ' + direction + transfer.state)
    debug('transfer is: ' + JSON.stringify(transfer, null, 2))
    this.emit(direction + transfer.state, transfer)
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

  sendTransfer (outgoingTransfer) {
    return this._sendUniversal(outgoingTransfer)
  }

  fulfillCondition (transferId, fulfillment) {
    const uuid = '0x' + transferId.replace(/\-/g, '')
    const fulfillmentBytes = '0x' + Buffer.from(fulfillment.match(/cf:0:(.+)/)[1], 'base64').toString('hex')
    
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
        uuid,                                      // uuid
        fulfillmentBytes,                    // data
        {
          from: this.address,
          gas: 3000000, // TODO?: specify this?
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
      const balance = this.web3.eth.getBalance(this.address)
      resolve(balance.toString(10))
    })
  }

  _sendUniversal (outgoingTransfer) {
    if (!this.web3) {
      return Promise.reject(new Error('must be connected'))
    }

    const account = outgoingTransfer.account.split('.')[3]
    const uuid = '0x' + outgoingTransfer.id.replace(/\-/g, '')

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
              this.notesToSelf[uuid] = JSON.stringify(outgoingTransfer.noteToSelf)
              resolve()
            })
        }
      }

		const condition = outgoingTransfer.executionCondition.match(/cc:0:3:(.+?):32/)[1]
	console.log('execution condition:', condition)
      console.log('\x1b[33mDATA:\x1b[39m', this.web3.toHex(JSON.stringify(outgoingTransfer.data)))
      console.log('\x1b[33mexpires at:\x1b[39m', this.web3.toHex(((new Date(outgoingTransfer.expiresAt)).getTime() / 1000) | 0))
      const result = this.contract.createTransfer.sendTransaction(
        account,                                  // receiver
        '0x' + Buffer.from(condition, 'base64').toString('hex'),
        uuid,                                       // uuid
        this.web3.toHex(((new Date(outgoingTransfer.expiresAt)).getTime() / 1000) | 0), // expiry
        this.web3.toHex(JSON.stringify(outgoingTransfer.data)),                    // data
        {
          from: this.address,
          value: this.web3.toWei(outgoingTransfer.amount, 'ether'),
          gas: 3000000, // TODO?: specify this?
        },
        handle
      )
      this._log('result: ' + result)
    })
  }

  _listen () {
    const filter = this.web3.eth.filter({
      address: this.contractAddress,
      topics: [this.address]
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
    debug(this.debugId, ...arguments)
  }
}

module.exports = PluginEthereum
