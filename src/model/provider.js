const Web3 = require('web3')

module.exports = (address) => {
  return new Web3.providers.HttpProvider(address)
}
