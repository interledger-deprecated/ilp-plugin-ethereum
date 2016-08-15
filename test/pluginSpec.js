const Plugin = require('../app/lib/plugin')
const testrpc = 'http://localhost:8485'

contract('Plugin', function () {
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
        abi: this.ledger.abi
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
})
