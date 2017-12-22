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
  event Fulfill (bytes16 indexed uuid, bytes32 fulfillment, bytes fulfillmentData);
  event Debug (string msg);
  event DebugInt (string msg, uint num);

  /* These represent all the money that is currently on hold or has been on
   * hold. They are retained so that transactions can't be played back
   */
  mapping (bytes16 => Transfer) public transfers;
  mapping (bytes16 => bytes) public memos;
  mapping (bytes16 => bytes) public fulfillmentData;

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
      Debug('id of 0 or existing transfer');
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
    bytes32 fulfillment,
    bytes fulfillmentData
  ) public payable returns (int8) {
      Debug('starting fulfill');
      var transfer = transfers[uuid];
      Debug('got transfer');
    
    Debug('is ID 0?');
    if (transfer.sender == 0x0) {
        Debug('id was 0');
      return -1;
    }
    
    Debug('was state propose?');
    if (transfer.state != State.Propose) {
      Debug('state wasnt propose');
      return -2;
    }
    DebugInt('timestamp', block.timestamp);
    DebugInt('expiry is', transfer.expiry);
    Debug('is expired?');
    if (block.timestamp > transfer.expiry) {
        Debug('its expired');
      if (transfer.sender.send(transfer.amount)) {
        transfer.state = State.Cancel;
        transfers[uuid] = transfer;

        /* inform the two parties about this */
        Update(uuid, transfer.state);

        return 1;
      } else {
        return -3;
      }
    }
    
    Debug('is fulfilled?');
    if (sha256(fulfillment) == transfer.condition) {
      if (transfer.receiver.send(transfer.amount)) {
        transfer.state = State.Fulfill;
        transfers[uuid] = transfer;
        fulfillmentData[uuid] = fulfillmentData;

        /* inform the two parties about this */
        Fulfill(uuid, fulfillment, fulfillmentData);

        return 0;
      } else {
        return -4;
      }
    }
    
    Debug('none of the above');
  }
}
