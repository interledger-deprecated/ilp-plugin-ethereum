# ILP Plugin-Ethereum

> An optimistic ILP LedgerPlugin for sending Ether

# Function

An optimistic ledger plugin can, as the name suggests, only send
optimistic-mode Interledger transfers. This means none of its payments will be
conditional.

Because optimistic mode could allow untrusted connectors to make off with your
funds, it's unsuitable for any path that goes through parties you don't know.
Optimistic mode is perfectly fine if you happen to trust the connectors, however.

Fortunately, this is exactly the situation for settlement. You are trying to send
some money to a connector that you trust, and they credit an account that you own.
Because the trusted connector is the only hop along the way, it's safe.

ILP Plugin Ethereum allows you to perform this optimistic transfer over the ethereum
network, **so long as the connector also has an instance of this plugin listening for
incoming transfers.**

# Usage

To test the plugin, first download this repository and run `npm install`. To instantiate a plugin, the following fields are needed:

```js
{
  "provider": "http://localhost:8000", // URL of your web3 provider
  "account":  "0x20f5beb5c3858433633f53f8e08c5da19d17516e" // account for this plugin (must be unlocked)
}
```

The ILP address of the plugin above will be:

```js
"ethereum.0x20f5beb5c3858433633f53f8e08c5da19d17516e"
```
