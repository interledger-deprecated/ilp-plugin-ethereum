'use strict'

contract('Ledger', function (accounts) {
  describe('createTransfer', function () {
    beforeEach(function () {
      this.ledger = Ledger.deployed()
      this.opts = [
        accounts[0], // receiver
        '', // condition
        '0x1', // uuid
        '0x0', // expiry
        '' // extra data
      ]
    })

    it('should create a transfer', function () {
      return this.ledger.createTransfer.call(...this.opts)
        .then((result) => {
          assert.equal(result.valueOf(), 0x0, 'valid options should give result of 0')
        })
    })

    it('should not create a transfer with uuid 0x0', function () {
      this.opts[2] = 0x0 // set uuid to 0x0

      return this.ledger.createTransfer.call(...this.opts)
        .then((result) => {
          assert.equal(result.valueOf(), -1, 'uuid of 0 should give result of -1')
        })
    })

    it('should not create a transfer with a repeat id', function () {
      return this.ledger.createTransfer(...this.opts)
        .then(() => {
          return this.ledger.createTransfer.call(...this.opts)
        })
        .then((result) => {
          assert.equal(result.valueOf(), -1, 'repeated uuid should give result of -1')
        })
    })
  })
})
