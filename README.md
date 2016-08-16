# JS-ILP-Plugin-Ethereum

> An optimistic ILP LedgerPlugin for sending Ether

# Function

An optimistic ILP LedgerPlugin is designed to run under a trustline. On many networks like Ethereum and Bitcoin,
the time for a transaction to go through can be long. To submit and fulfill a transaction can take minutes.

In the new model, a trustline can be run between two connectors, which has virtually no delay. The two connectors
must have trust with one another, but aside from that all security stays the same. When the balance between the
two connectors has reached the maximum that they will allow, a settlement is triggered.

This automatic settlement is where the optimistic Ledger Plugin comes in. The one connector's trustline calls the send function
of the plugin, which sends an optimistic payment to the other connector. The trustline balance is then updated. No matter how
slow the transaction to settle is, it won't interfere with the payments being routed through.

# Usage

To test the plugin, first download this repository and run `npm install`. Then
run `npm test`. The tests use truffle and a local testrpc provider.
