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

  describe('fulfillTransfer', function () {
    beforeEach(function () {
      this.fulfillment = '0x0'
      this.ledger = Ledger.deployed()
      this.opts = [
        accounts[0],
        '0xb8ad1bd2ff50021ff6a1239585cc9ccde31e70072299c3cc910da54f9e791f7c',
        '0x1',
        '0x0',
        '',
      ]
    })

    it('should expire an expired transfer', function () {
      this.ledger.createTransfer(...this.opts)
        .then(() => {
          return this.ledger.fulfillTransfer.call('0x1', '0x0')
        })
        .then((result) => {
          assert.equal(result.valueOf(), 1, 'expired transfer should return 1 on fulfill')
        })
    })

    it('should give an error code fulfilling a finished transfer', function () {
      this.ledger.createTransfer(...this.opts)
        .then(() => {
          return this.ledger.fulfillTransfer('0x1', '0x0')
        })
        .then(() => {
          return this.ledger.fulfillTransfer.call('0x1', '0x0')
        })
        .then((result) => {
          assert.equal(result.valueOf(), -2, 'double fulfill should return -2')
        })
    })

    it('should give an error code fulfilling a nonexistant transfer', function () {
      this.ledger.fulfillTransfer.call('0x1', '0x0')
        .then(() => {
          assert.equal(result.valueOf(), -1, 'nonexistant transfer should return -1 on fulfill')
        })
    })
  })
})
