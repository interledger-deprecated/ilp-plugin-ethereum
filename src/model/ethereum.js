'use strict'

const Web3 = require('web3')
const debug = require('debug')('ilp-plugin-ethereum:ethereum')
const abi = require('../abi/ledger.json')
const stateToName = (state) => {
  return ([ 'prepare', 'fulfill', 'cancel', 'reject' ])[state]
}

// TODO: better number conversion
const gweiToWei = (amount) => (amount + '000000000')
const accountToHex = (account) => account.split('.').reverse()[0]
const hexToAccount = (prefix, account) => prefix + '0x' + account.substring(2).toUpperCase()
const uuidToHex = (uuid) => '0x' + uuid.replace(/\-/g, '')
const conditionToHex = (condition) => '0x' + Buffer.from(condition, 'base64').toString('hex')
const fulfillmentToHex = conditionToHex
const isoToHex = (web3, iso) => web3.toHex(Math.round((new Date(iso)).getTime() / 1000))
const ilpToData = (ilp) => '0x' + Buffer.from(ilp, 'base64').toString('hex')

function waitForReceipt (web3, hash) {
  return new Promise((resolve) => {
    function poll () {
      try {
        if (web3.eth.getTransactionReceipt(hash)) resolve()
        else setTimeout(poll, 5000)
      } catch (e) {
        debug('poll error:', e.message)
      }
    }
    
    poll()
  })
}

function fulfillCondition (contract, { address, uuid, fulfillment }) {
  return new Promise((resolve, reject) => {
    contract.fulfillTransfer.sendTransaction(
      uuidToHex(uuid), // uuid
      fulfillmentToHex(fulfillment), // fulfillment
      { from: address,
        // TODO: how much gas is correct?
        gas: 300000 }, (error, result) => {
          if (error) reject(error)
          resolve(result)
        })
  })
}

function sendTransfer (contract, transfer, web3) {
  return new Promise((resolve, reject) => {
    contract.createTransfer.sendTransaction(
      accountToHex(transfer.to), // destination
      conditionToHex(transfer.executionCondition), // condition
      uuidToHex(transfer.id), // uuid
      isoToHex(web3, transfer.expiresAt), // expiry
      ilpToData(transfer.ilp), // ilp
      { from: transfer.from,
        value: gweiToWei(transfer.amount),
        // TODO: how much gas is correct?
        gas: 1000000 }, (error, result) => {
          if (error) reject(error)
          resolve(result)
        })
  })
}

function getContract (web3, address) {
  return web3.eth.contract(abi).at(address)
}

function getTransfer (contract, uuid) {
  return new Promise((resolve, reject) => {
    contract.transfers(uuid, (error, result) => {
      if (error) reject(error)
      resolve(result)
    })
  })
}

function getMemo (contract, uuid) {
  return new Promise((resolve, reject) => {
    contract.memos(uuid, (error, result) => {
      if (error) reject(error)
      resolve(result)
    })
  })
}

function onEvent (contract, name, callback) {
  contract[name]((error, result) => {
    if (error) {
      console.error(name + ' error:', error)
      return
    }

    Promise.resolve(callback(result)).catch((e) => {
      console.error('Ethereum onEvent callback error:', e.stack)
    })
  })
}

module.exports = {
  onEvent,
  getMemo,
  getTransfer,
  getContract,
  waitForReceipt,
  sendTransfer,
  fulfillCondition,
  stateToName,
  hexToAccount
}
