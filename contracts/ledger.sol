pragma solidity ^0.4.0;
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
    uint expiry;
    State state;
  }

  /* notifications to listen to. Because the event size in solidity seems to be
   * limited, a uuid is given to look up the other information. Target could be
   * either the sender or the receiver.
   */
  event Update (bytes16 indexed uuid, State state);
  event Fulfill (bytes16 indexed uuid, bytes fulfillment);
  event Debug (string msg);
  event DebugInt (string msg, uint num);

  /* These represent all the money that is currently on hold or has been on
   * hold. They are retained so that transactions are idempotent.
   */
  mapping (bytes16 => Transfer) public transfers;
  mapping (bytes16 => bytes) public memos;

  function test (bytes16 uuid) public payable returns (int8) {
    Update(uuid, State.Propose);
  }

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
  ) public payable returns (int8) {
    Debug('starting createTransfer');
    if (transfers[uuid].sender != address(0x0)
    || uuid == 0x0) {
      Debug('invalid or existing transfer');
      return -1;
    }
    Debug('creating transfer');
    transfers[uuid] = Transfer(
      msg.sender, /* sender */
      receiver,   /* receiver */
      msg.value,  /* amount */
      condition,  /* condition */
      expiry,     /* expiry */
      State.Propose /* transfer state */
    );
    memos[uuid] = data;
    Debug('created transfer');
    DebugInt('expiry is', expiry);

    // emits the incoming/outgoing fulfill events
    Update(uuid, State.Propose);

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
  ) public payable returns (int8) {
    Debug('starting fulfill');
    var transfer = transfers[uuid];
    
    Debug('does transfer exist?');
    if (transfer.sender == address(0x0)) {
      Debug('transfer does not exist');
      return -1;
    }
    
    Debug('was state propose?');
    if (transfer.state != State.Propose) {
      Debug('transfer already resolved');
      return -2;
    }

    DebugInt('time is', block.timestamp);
    DebugInt('expiry is', transfer.expiry);

    Debug('is transfer expired?');
    if (block.timestamp > transfer.expiry) {
      Debug('transfer expired');
      if (transfer.sender.send(transfer.amount)) {
        transfer.state = State.Cancel;
        transfers[uuid] = transfer;

        // emits incoming/outgoing cancel
        Update(uuid, transfer.state);

        return 1;
      } else {
        return -3;
      }
    }
    
    Debug('is transfer fulfilled?');
    if (sha256(fulfillment) == transfer.condition) {
      Debug('transfer fulfilled');
      if (transfer.receiver.send(transfer.amount)) {
        transfer.state = State.Fulfill;
        transfers[uuid] = transfer;

        // emits incoming/outgoing fulfill
        Fulfill(uuid, fulfillment);

        return 0;
      } else {
        Debug('fatal: unable to send funds');
        return -4;
      }
    }

    Debug('neither expired nor fulfilled');
  }
}
