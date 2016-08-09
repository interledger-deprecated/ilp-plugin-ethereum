contract Ledger {

  /* possible states for a transfer to be in at a given moment */
  enum State {
    Propose,
    Fulfill,
    Cancel,
    Reject
  }

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
    bytes data;
    State state;
  }

  /* notifications to listen to. Because the event size in solidity seems to be
   * limited, a uuid is given to look up the other information. Target could be
   * either the sender or the receiver.
   */
  event Update (bytes16 indexed uuid, State state);

  /* These represent all the money that is currently on hold or has been on
   * hold. They are retained so that transactions can't be played back
   */
  mapping (bytes16 => Transfer) public transfers;

  /* Create a transfer. The amount of the transfer is specified by the
   * amount that you send the contract in your transaction. If a transfer
   * has already been created with that uuid, then it will throw.
   *
   * Exit codes:
   *  0. successfully created transfer
   *
   *  -1. invalid uuid
   */
  function createTransfer (
    address receiver,
    bytes32 condition,
    bytes16 uuid,
    uint expiry,
    bytes data
  ) public returns (int8) {
    if (transfers[uuid].uuid != bytes16(0x0)
    || uuid == 0x0) {
      return -1;
    }
    transfers[uuid] = Transfer(
      msg.sender, /* sender */
      receiver,   /* receiver */
      msg.value,  /* amount */
      condition,  /* condition */
      uuid,       /* uuid */
      expiry,     /* expiry */
      data,       /* additional data */
      State.Propose /* transfer state */
    );
    return 0;
  }

  /* Fulfill a transfer, or trigger a rollback if past expiry. The uuid is
   * the id of the transfer to fulfill, and the fulfillment is just a string
   * of bytes, which, when hashed with sha256, will match the condition.
   * If the expiry is past, then the transfer will rollback regardless of the
   * fulfillment given.
   *
   * Exit codes:
   *  0. transfer successfully executed
   *  1. transfer successfully rolled back
   *
   *  -1. transfer did not exist
   *  -2. transfer was already executed or rejected
   *  -3. transfer should roll back, but could not move funds
   *  -4. transfer should execute, but could not move funds
   */
  function fulfillTransfer (
    bytes16 uuid,
    bytes fulfillment
  ) public returns (int8) {
    var transfer = transfers[uuid];
    if (transfer.uuid == 0x0) {
      return -1;
    } else if (transfer.state != State.Propose) {
      return -2;
    } else if (block.timestamp > transfer.expiry) {
      if (transfer.sender.send(transfer.amount)) {
        transfer.state = State.Cancel;
        transfers[transfer.uuid] = transfer;

        /* inform the two parties about this */
        Update(transfer.uuid, transfer.state);

        return 1;
      } else {
        return -3;
      }
    } else if (sha256(fulfillment) == transfer.condition) {
      if (transfer.receiver.send(transfer.amount)) {
        transfer.state = State.Fulfill;
        transfers[transfer.uuid] = transfer;

        /* inform the two parties about this */
        Update(transfer.uuid, transfer.state);

        return 0;
      } else {
        return -4;
      }
    }
  }
}
