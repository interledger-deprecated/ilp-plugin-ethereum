'use strict'

const uuid4 = require('uuid4')

const uuid = () => ('0x' + uuid4().replace(/-/g, ''))

contract('Ledger', function (accounts) {
  describe('createTransfer', function () {
    beforeEach(function () {
      this.ledger = Ledger.deployed()
      this.uuid = uuid()
      this.opts = [
        accounts[0], // receiver
        '', // condition
        this.uuid, // uuid
        '', // extra data
        '0x0' // expiry
      ]
    })

    it('should create a transfer', function (done) {
      return this.ledger.createTransfer.call(...this.opts)
        .then((result) => {
          assert.equal(result.valueOf(), 0x0, 'valid options should give result of 0')
          done()
        })
        .catch(done)
    })

    it('should not create a transfer with uuid 0x0', function (done) {
      this.opts[2] = 0x0 // set uuid to 0x0

      return this.ledger.createTransfer.call(...this.opts)
        .then((result) => {
          assert.equal(result.valueOf(), -1, 'uuid of 0 should give result of -1')
          done()
        })
        .catch(done)
    })

    it('should not create a transfer with a repeat id', function (done) {
      return this.ledger.createTransfer(...this.opts)
        .then(() => {
          return this.ledger.createTransfer.call(...this.opts)
        })
        .then((result) => {
          assert.equal(result.valueOf(), -1, 'repeated uuid should give result of -1')
          done()
        })
        .catch(done)
    })
  })

  describe('fulfillTransfer', function () {
    beforeEach(function () {
      this.fulfillment = '0x0'
      this.ledger = Ledger.deployed()
      this.uuid = uuid()
      this.opts = [
        accounts[0],
        '',
        this.uuid,
        '',
        '0x0',
      ]
    })

    it('should fulfill a valid transfer with a valid fulfillment', function (done) {
      // set the expiry, then condition
      this.opts[4] = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
      this.opts[1] = '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

      this.ledger.createTransfer(...this.opts)
        .then(() => {
          return this.ledger.fulfillTransfer.call(this.uuid, '0')
        })
        .then((result) => {
          assert.equal(result.valueOf(), 0, 'should return 0 on sucessful fulfill')
          done()
        })
        .catch(done)
    })

    it('should not fulfill without a valid fulfillment', function (done) {
      // set the expiry
      this.opts[4] = '115792089237316195423570985008687907853269984665640564039457584007913129639935'

      this.ledger.createTransfer(...this.opts)
        .then(() => {
          return this.ledger.fulfillTransfer.call(this.uuid, 'garbage')
        })
        .then((result) => {
          assert.equal(result.valueOf(), -5, 'should return -5 on invalid fulfillment')
          done()
        })
        .catch(done)
    })

    it('should expire an expired transfer', function (done) {
      this.ledger.createTransfer(...this.opts)
        .then(() => {
          return this.ledger.fulfillTransfer.call(this.uuid, '0x0')
        })
        .then((result) => {
          assert.equal(result.valueOf(), 1, 'expired transfer should return 1 on fulfill')
          done()
        })
        .catch(done)
    })

    it('should give an error code fulfilling a finished transfer', function (done) {
      this.ledger.createTransfer(...this.opts)
        .then(() => {
          return this.ledger.fulfillTransfer(this.uuid, '0x0')
        })
        .then(() => {
          return this.ledger.fulfillTransfer.call(this.uuid, '0x0')
        })
        .then((result) => {
          assert.equal(result.valueOf(), -2, 'double fulfill should return -2')
          done()
        })
        .catch(done)
    })

    it('should give an error code fulfilling a nonexistant transfer', function (done) {
      this.ledger.fulfillTransfer.call(this.uuid, '0x0')
        .then((result) => {
          assert.equal(result.valueOf(), -1, 'nonexistant transfer should return -1 on fulfill')
          done()
        })
        .catch(done)
    })
  })
})
