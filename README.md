# ILP Plugin-Ethereum

> An ILP Ledger Plugin for sending Ether

_**Note:** This plugin is not currently production ready_

## How It Works

The contract in `contracts/ledger.sol` is a (prototype) implementation of hashlocked transfers on
Ethereum. It takes payments with a hash and will forward the funds to a destination when fulfillCondition
is called with the matching preimage. It also has an expiry timestamp, which will release funds back to
the sender if the block timestamp is higher. This contract has not been security reviewed, and might
have errors in the implementation.

The plugin itself uses the `web3` library to connect to a local provider. It takes the address of the
contract to listen for events on and send transfers to. A sender and receiver must have their plugins
configured with the same contract address.

## Planned Features

- Messaging
- Security review contract
- Clean up error handling
- Use a more reliable time than block timestamp

## Usage

To test the plugin, first download this repository and run `npm install`. To instantiate a plugin, the following fields are needed:

```js
{
  "provider": "http://localhost:8000", // URL of your web3 provider
  "address":  "0x20f5beb5c3858433633f53f8e08c5da19d17516e", // address of the account for this plugin (must be unlocked)
  "contract": "0x0000000000000000000000000000000000000000" // should actually be the deployed contract address
}
```

The ILP address of the plugin above will be:

```js
"g.crypto.ethereum.0x20f5beb5c3858433633f53f8e08c5da19d17516e"
```
