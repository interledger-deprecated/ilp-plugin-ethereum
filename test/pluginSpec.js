const Plugin = require('../app/lib/plugin')
const uuid = require('uuid4')

const testrpc = 'http://localhost:8545'
const err = e => console.error(e)

contract('Plugin', function (accounts) {
  describe('constructor', function () {
    it('should be a constructor', () => {
      assert.isFunction(Plugin, 'should be a contructor')
    })

    it('should return an object', () => {
      assert.isObject(new Plugin({
        provider: testrpc,
        contract: '0x0',
        abi: []
      }))
    })
  })

  describe('connect', function () {
    beforeEach(function () {
      this.ledger = Ledger.deployed()
      this.plugin = new Plugin({
        provider: testrpc,
        contract: this.ledger.address,
        abi: this.ledger.abi,
      })
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
      this.ledger = Ledger.deployed()
      this.plugin = new Plugin({
        provider: testrpc,
        contract: this.ledger.address,
        abi: this.ledger.abi,
      })

      this.plugin.on('connect', done)
      this.plugin.connect()
    })
    
    it('should emit \'outgoing transfer\'', function (done) {
      this.plugin.on('outgoing_transfer', () => {
        done()
      })

      this.plugin.send({
        'id': uuid(),
        'account': accounts[1],
        'amount': '0.1',
      })
        .catch(done)
    })

    it('should not send a transfer with negative amount', function (done) {
      this.plugin.send({
        'id': uuid(),
        'account': accounts[1],
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
