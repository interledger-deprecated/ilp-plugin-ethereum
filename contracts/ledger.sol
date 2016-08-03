contract Ledger {

  /* represents a single transfer. It will execute when the preimage of
   * condition is found, and will rollback if fulfill is called when the expiry
   * is passed.
   */
  struct Transfer {
    address sender;
    address receiver;
    uint256 amount;
    bytes32 condition;
    bytes16 uuid;
    uint expiry;
    bool executed;
    bool rejected;
    bytes data;
  }

  /* These represent all the money that is currently on hold or has been on
   * hold. They are retained so that transactions can't be played back
   */
  mapping (bytes16 => Transfer) public transfers;

  /* Create a transfer. The amount of the transfer is specified by the
   * amount that you send the contract in your transaction. If a transfer
   * has already been created with that uuid, then it will throw.
   */
  function createTransfer (
    address receiver,
    bytes32 condition,
    bytes16 uuid,
    uint expiry,
    bytes data
  ) public {
    if (transfers[uuid].uuid == bytes16(0x0)) {
      throw;
    }
    var transfer = Transfer(
      msg.sender, /* sender */
      receiver,
      msg.value, /* amount */
      condition,
      uuid,
      expiry,
      false, /* executed? */
      false, /* rejected? */
      data
    );
  }

  /* Fulfill a transfer, or trigger a rollback if past expiry. The uuid is
   * the id of the transfer to fulfill, and the fulfillment is just a string
   * of bytes, which, when hashed with sha256, will match the condition.
   * If the expiry is past, then the transfer will rollback regardless of the
   * fulfillment given.
   */
  function fulfillTransfer (
    bytes16 uuid,
    bytes fulfillment
  ) public {
    var transfer = transfers[uuid];
    if (transfer.executed || transfer.rejected) {
      throw;
    } else if (block.timestamp > transfer.expiry)
      if (transfer.sender.send(transfer.amount) {
        transfer.rejected = true;
        transfers[transfer.uuid] = transfer;
      }
    } else if (sha256(fulfillment) == transfer.condition) {
      if (transfer.receiver.send(transfer.amount)) {
        transfer.executed = true;
        transfers[transfer.uuid] = transfer;
      }
    }
  }
}
