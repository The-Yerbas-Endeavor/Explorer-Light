# Saved lifetime received totals

Addresses listed in the comma-separated `ADDRESS_UTXO_ONLY` service environment use saved lifetime received totals while their full history scans remain disabled.

The explorer worker bootstraps each total with one isolated `getaddressbalance` call. It records the received amount in integer duffs, block height, canonical block hash, and update time. It checks that the chain did not change during initialization. It never requests lifetime transaction IDs or address deltas.

After initialization, the worker runs once a minute and processes at most 100 new decoded blocks per address. It adds every native output to the address, including change, matching Core's lifetime received definition. Current balance continues to come from the complete confirmed UTXO result, independently of the lifetime checkpoint.

Snapshots are written atomically under `/var/lib/yerbas-explorer-light/address-received`, or `ADDRESS_RECEIVED_DIR` when set. The explorer service needs write access to this directory. Reading an address page only reads and validates the saved checkpoint; it cannot start a historical scan. The page identifies the checkpoint block instead of implying that the total includes later blocks.

An invalidated checkpoint is hidden and rebuilt by the background worker. Failed initialization or updates do not overwrite a previously saved checkpoint. Updates are suspended during initial block download. A restart loads the saved total and resumes from its checkpoint without repeating initialization.
