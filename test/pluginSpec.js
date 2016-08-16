const Web3 = require('web3')
const Plugin = require('../src/lib/plugin')
const uuid = require('uuid4')
const debug = require('debug')('test')

const TestRPC = require('ethereumjs-testrpc')
const accounts = [
  {
    balance: 20000000000,
    address: '0xad4edb0f8ede3b6c2f243450e69aa1a55c2d8bbe'
  },
  {
    balance: 20000000000,
    address: '0x105813e3d3d9c59a288a109f98e2866fcebd2564'
  }
]

const assert = require('chai').assert
const mockRequire = require('mock-require')
const testrpc = () => {
  debug('getting mocked')
  return Web3.providers.HttpProvider('http://localhost:8545')
}
mockRequire('../src/model/provider', testrpc)

describe('Plugin', function () {
  
  describe('constructor', function () {
    it('should be a constructor', () => {
      assert.isFunction(Plugin, 'should be a contructor')
    })

    it('should return an object', () => {
      assert.isObject(new Plugin({
        provider: '',
        prefix: 'ethereum.'
      }))
    })
  })

  describe('connect', function () {
    beforeEach(function () {
      this.plugin = new Plugin({
        provider: '',
        prefix: 'ethereum.'
      })
    })

    afterEach(function () {
      this.plugin.disconnect()
    })

    it('should not start connected', function () {
      assert.isFalse(this.plugin.isConnected(), 'plugin not start connected')
    })

    it('should connect', function (done) {
      this.plugin.on('connect', () => {
        assert.isTrue(this.plugin.isConnected())
        done()
      })
      this.plugin.connect()
        .then((result) => {
          assert.isNull(result, 'connect should resolve to null')
        })
    })

    it('should disconnect', function (done) {
      this.plugin.on('disconnect', () => {
        assert.isFalse(this.plugin.isConnected(), 'plugin not start connected')
        done()
      })
  
      this.plugin.on('connect', () => {
        assert.isTrue(this.plugin.isConnected())
        this.plugin.disconnect()
          .then((result) => {
            assert.isNull(result, 'connect should resolve to null')
          })
      })

      this.plugin.connect()
    })
  })

  describe('send optimistic', function () {
    beforeEach(function (done) {
      this.plugin = new Plugin({
        provider: '',
        prefix: 'ethereum.'
      })

      this.plugin.on('connect', done)
      this.plugin.connect()
    })

    afterEach(function () {
      this.plugin.disconnect()
    })
    
    it('should emit \'outgoing transfer\'', function (done) {
      const id = uuid()

      this.plugin.once('outgoing_transfer', (transfer) => {
        debug(JSON.stringify(transfer, null, 2))
        assert.equal(transfer.id, id, 'id of emitted transfer should match')
        done()
      })

      this.plugin.send({
        'id': id,
        'account': 'ethereum.' + accounts[1].address,
        'amount': '0.1',
      })
        .catch(done)
    })

    it('should send a 0-amount transfer', function (done) {
      const id = uuid()

      this.plugin.once('outgoing_transfer', (transfer) => {
        debug(JSON.stringify(transfer, null, 2))
        assert.equal(transfer.id, id, 'id of emitted transfer should match')
        done()
      })

      this.plugin.send({
        'id': id,
        'account': 'ethereum.' + accounts[1].address,
        'amount': '0.0',
      })
        .catch(done)
    })

    it('should not send a transfer with negative amount', function (done) {
      const id = uuid()

      this.plugin.send({
        'id': id,
        'account': 'ethereum.' + accounts[1].address,
        'amount': '-0.1',
      })
        .catch((e) => {
          assert.equal(e.message, 'amount must be greater than or equal to 0',
            'should give the correct error for negative amount')
          done()
        })
        .catch(done)
    })
  })
})
