/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/fogopulse.json`.
 */
export type Fogopulse = {
  "address": "Ht3NLQDkJG4BLgsnUnyuWD2393wULyP5nEXx8AyXhiGr",
  "metadata": {
    "name": "fogopulse",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "FOGO Pulse - Prediction market on FOGO chain"
  },
  "instructions": [
    {
      "name": "createEpoch",
      "discriminator": [
        115,
        111,
        36,
        230,
        59,
        145,
        168,
        27
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Anyone can call - permissionless for crank bots/keepers"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "globalConfig",
          "docs": [
            "GlobalConfig - boxed to prevent stack overflow"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "docs": [
            "Pool - must have no active epoch"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.asset_mint",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "epoch",
          "docs": [
            "Epoch account to be created"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  112,
                  111,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "pool.next_epoch_id",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "clock",
          "docs": [
            "Clock sysvar for timestamp"
          ],
          "address": "SysvarC1ock11111111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "startPrice",
          "type": "u64"
        },
        {
          "name": "startConfidence",
          "type": "u64"
        },
        {
          "name": "startPublishTime",
          "type": "i64"
        }
      ]
    },
    {
      "name": "createPool",
      "discriminator": [
        233,
        146,
        209,
        142,
        207,
        104,
        64,
        188
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin authority - must match GlobalConfig.admin"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "globalConfig",
          "docs": [
            "GlobalConfig account - boxed to prevent stack overflow"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "assetMint",
          "docs": [
            "Asset mint this pool will track (e.g., BTC mint address)",
            "Admin is trusted to pass valid SPL token mints. Invalid mints create unusable",
            "pools but pose no security risk (they're simply useless)."
          ]
        },
        {
          "name": "pool",
          "docs": [
            "Pool account to be created"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "globalConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "treasury",
          "type": "pubkey"
        },
        {
          "name": "insurance",
          "type": "pubkey"
        },
        {
          "name": "tradingFeeBps",
          "type": "u16"
        },
        {
          "name": "lpFeeShareBps",
          "type": "u16"
        },
        {
          "name": "treasuryFeeShareBps",
          "type": "u16"
        },
        {
          "name": "insuranceFeeShareBps",
          "type": "u16"
        },
        {
          "name": "perWalletCapBps",
          "type": "u16"
        },
        {
          "name": "perSideCapBps",
          "type": "u16"
        },
        {
          "name": "oracleConfidenceThresholdStartBps",
          "type": "u16"
        },
        {
          "name": "oracleConfidenceThresholdSettleBps",
          "type": "u16"
        },
        {
          "name": "oracleStalenessThresholdStart",
          "type": "i64"
        },
        {
          "name": "oracleStalenessThresholdSettle",
          "type": "i64"
        },
        {
          "name": "epochDurationSeconds",
          "type": "i64"
        },
        {
          "name": "freezeWindowSeconds",
          "type": "i64"
        },
        {
          "name": "allowHedging",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "epoch",
      "discriminator": [
        93,
        83,
        120,
        89,
        151,
        138,
        152,
        108
      ]
    },
    {
      "name": "globalConfig",
      "discriminator": [
        149,
        8,
        156,
        202,
        160,
        252,
        176,
        217
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    }
  ],
  "events": [
    {
      "name": "epochCreated",
      "discriminator": [
        191,
        150,
        240,
        63,
        59,
        212,
        233,
        124
      ]
    },
    {
      "name": "globalConfigInitialized",
      "discriminator": [
        5,
        221,
        172,
        158,
        77,
        87,
        157,
        113
      ]
    },
    {
      "name": "poolCreated",
      "discriminator": [
        202,
        44,
        41,
        88,
        104,
        220,
        157,
        82
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized - admin signature required"
    },
    {
      "code": 6001,
      "name": "alreadyInitialized",
      "msg": "GlobalConfig already initialized"
    },
    {
      "code": 6002,
      "name": "invalidFeeShare",
      "msg": "Invalid fee share - must sum to 10000 bps"
    },
    {
      "code": 6003,
      "name": "invalidCap",
      "msg": "Invalid cap value - must be between 0 and 10000 bps"
    },
    {
      "code": 6004,
      "name": "invalidTradingFee",
      "msg": "Invalid trading fee - must be between 0 and 1000 bps (10%)"
    },
    {
      "code": 6005,
      "name": "invalidTimingParams",
      "msg": "Invalid timing parameters - freeze window must be less than epoch duration, epoch must be at least 60 seconds"
    },
    {
      "code": 6006,
      "name": "invalidOracleThreshold",
      "msg": "Invalid oracle threshold - must be between 1 and 10000 bps"
    },
    {
      "code": 6007,
      "name": "protocolPaused",
      "msg": "Protocol is paused - no new operations allowed"
    },
    {
      "code": 6008,
      "name": "protocolFrozen",
      "msg": "Protocol is frozen - emergency halt active"
    },
    {
      "code": 6009,
      "name": "poolPaused",
      "msg": "Pool is paused - no new epochs allowed"
    },
    {
      "code": 6010,
      "name": "poolFrozen",
      "msg": "Pool is frozen - emergency halt active"
    },
    {
      "code": 6011,
      "name": "epochAlreadyActive",
      "msg": "Cannot create epoch - active epoch exists"
    },
    {
      "code": 6012,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "epoch",
      "docs": [
        "Epoch account - represents a time-bounded trading period within a pool"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "docs": [
              "Parent pool reference"
            ],
            "type": "pubkey"
          },
          {
            "name": "epochId",
            "docs": [
              "Sequential identifier within pool (0, 1, 2, ...)"
            ],
            "type": "u64"
          },
          {
            "name": "state",
            "docs": [
              "Current epoch state"
            ],
            "type": {
              "defined": {
                "name": "epochState"
              }
            }
          },
          {
            "name": "startTime",
            "docs": [
              "Unix timestamp when epoch begins"
            ],
            "type": "i64"
          },
          {
            "name": "endTime",
            "docs": [
              "Unix timestamp when epoch ends"
            ],
            "type": "i64"
          },
          {
            "name": "freezeTime",
            "docs": [
              "When trading stops (end_time - freeze_window_seconds)"
            ],
            "type": "i64"
          },
          {
            "name": "startPrice",
            "docs": [
              "Oracle price at epoch creation"
            ],
            "type": "u64"
          },
          {
            "name": "startConfidence",
            "docs": [
              "Oracle confidence at epoch creation"
            ],
            "type": "u64"
          },
          {
            "name": "startPublishTime",
            "docs": [
              "Oracle publish timestamp at epoch creation"
            ],
            "type": "i64"
          },
          {
            "name": "settlementPrice",
            "docs": [
              "Oracle price at settlement (None until settled)"
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "settlementConfidence",
            "docs": [
              "Oracle confidence at settlement"
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "settlementPublishTime",
            "docs": [
              "Oracle publish timestamp at settlement"
            ],
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "outcome",
            "docs": [
              "Final outcome (Up, Down, or Refunded)"
            ],
            "type": {
              "option": {
                "defined": {
                  "name": "outcome"
                }
              }
            }
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "epochCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "epoch",
            "docs": [
              "Epoch account pubkey"
            ],
            "type": "pubkey"
          },
          {
            "name": "pool",
            "docs": [
              "Parent pool"
            ],
            "type": "pubkey"
          },
          {
            "name": "epochId",
            "docs": [
              "Sequential epoch identifier within pool"
            ],
            "type": "u64"
          },
          {
            "name": "startPrice",
            "docs": [
              "Oracle price at epoch creation"
            ],
            "type": "u64"
          },
          {
            "name": "startConfidence",
            "docs": [
              "Oracle confidence at epoch creation"
            ],
            "type": "u64"
          },
          {
            "name": "startTime",
            "docs": [
              "Unix timestamp when epoch begins"
            ],
            "type": "i64"
          },
          {
            "name": "endTime",
            "docs": [
              "Unix timestamp when epoch ends"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "epochState",
      "docs": [
        "Epoch state machine - tracks the lifecycle of a trading epoch"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "frozen"
          },
          {
            "name": "settling"
          },
          {
            "name": "settled"
          },
          {
            "name": "refunded"
          }
        ]
      }
    },
    {
      "name": "globalConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Admin authority - can update config, pause/freeze"
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Treasury account for fee collection (20% of fees)"
            ],
            "type": "pubkey"
          },
          {
            "name": "insurance",
            "docs": [
              "Insurance buffer account (10% of fees)"
            ],
            "type": "pubkey"
          },
          {
            "name": "tradingFeeBps",
            "docs": [
              "Trading fee in basis points (e.g., 180 = 1.8%)"
            ],
            "type": "u16"
          },
          {
            "name": "lpFeeShareBps",
            "docs": [
              "LP share of trading fees in basis points (e.g., 7000 = 70%)"
            ],
            "type": "u16"
          },
          {
            "name": "treasuryFeeShareBps",
            "docs": [
              "Treasury share of trading fees in basis points (e.g., 2000 = 20%)"
            ],
            "type": "u16"
          },
          {
            "name": "insuranceFeeShareBps",
            "docs": [
              "Insurance share of trading fees in basis points (e.g., 1000 = 10%)"
            ],
            "type": "u16"
          },
          {
            "name": "perWalletCapBps",
            "docs": [
              "Maximum position per wallet in basis points of pool (e.g., 500 = 5%)"
            ],
            "type": "u16"
          },
          {
            "name": "perSideCapBps",
            "docs": [
              "Maximum exposure per side in basis points of pool (e.g., 3000 = 30%)"
            ],
            "type": "u16"
          },
          {
            "name": "oracleConfidenceThresholdStartBps",
            "docs": [
              "Max confidence ratio for epoch start in basis points (e.g., 25 = 0.25%)"
            ],
            "type": "u16"
          },
          {
            "name": "oracleConfidenceThresholdSettleBps",
            "docs": [
              "Max confidence ratio for settlement in basis points (e.g., 80 = 0.8%)"
            ],
            "type": "u16"
          },
          {
            "name": "oracleStalenessThresholdStart",
            "docs": [
              "Max oracle age in seconds for epoch start (e.g., 3)"
            ],
            "type": "i64"
          },
          {
            "name": "oracleStalenessThresholdSettle",
            "docs": [
              "Max oracle age in seconds for settlement (e.g., 10)"
            ],
            "type": "i64"
          },
          {
            "name": "epochDurationSeconds",
            "docs": [
              "Epoch duration in seconds (e.g., 300 = 5 minutes)"
            ],
            "type": "i64"
          },
          {
            "name": "freezeWindowSeconds",
            "docs": [
              "Freeze window before settlement in seconds (e.g., 15)"
            ],
            "type": "i64"
          },
          {
            "name": "allowHedging",
            "docs": [
              "If true, users can hold both UP and DOWN positions in same epoch"
            ],
            "type": "bool"
          },
          {
            "name": "paused",
            "docs": [
              "Pause new epoch creation globally"
            ],
            "type": "bool"
          },
          {
            "name": "frozen",
            "docs": [
              "Emergency freeze - halts ALL activity"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "globalConfigInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "insurance",
            "type": "pubkey"
          },
          {
            "name": "tradingFeeBps",
            "type": "u16"
          },
          {
            "name": "lpFeeShareBps",
            "type": "u16"
          },
          {
            "name": "treasuryFeeShareBps",
            "type": "u16"
          },
          {
            "name": "insuranceFeeShareBps",
            "type": "u16"
          },
          {
            "name": "perWalletCapBps",
            "type": "u16"
          },
          {
            "name": "perSideCapBps",
            "type": "u16"
          },
          {
            "name": "oracleConfidenceThresholdStartBps",
            "type": "u16"
          },
          {
            "name": "oracleConfidenceThresholdSettleBps",
            "type": "u16"
          },
          {
            "name": "oracleStalenessThresholdStart",
            "type": "i64"
          },
          {
            "name": "oracleStalenessThresholdSettle",
            "type": "i64"
          },
          {
            "name": "epochDurationSeconds",
            "type": "i64"
          },
          {
            "name": "freezeWindowSeconds",
            "type": "i64"
          },
          {
            "name": "allowHedging",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "outcome",
      "docs": [
        "Final outcome of an epoch after settlement"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "up"
          },
          {
            "name": "down"
          },
          {
            "name": "refunded"
          }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetMint",
            "docs": [
              "Asset mint this pool tracks (e.g., BTC mint address)"
            ],
            "type": "pubkey"
          },
          {
            "name": "yesReserves",
            "docs": [
              "YES token reserves (USDC backing YES positions)"
            ],
            "type": "u64"
          },
          {
            "name": "noReserves",
            "docs": [
              "NO token reserves (USDC backing NO positions)"
            ],
            "type": "u64"
          },
          {
            "name": "totalLpShares",
            "docs": [
              "Total LP shares issued for this pool"
            ],
            "type": "u64"
          },
          {
            "name": "nextEpochId",
            "docs": [
              "Counter for next epoch creation (starts at 0)"
            ],
            "type": "u64"
          },
          {
            "name": "activeEpoch",
            "docs": [
              "Current active epoch PDA, or None if no active epoch"
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "activeEpochState",
            "docs": [
              "Cached state: 0=None, 1=Open, 2=Frozen"
            ],
            "type": "u8"
          },
          {
            "name": "walletCapBps",
            "docs": [
              "Max position per wallet in basis points (copied from GlobalConfig at creation)"
            ],
            "type": "u16"
          },
          {
            "name": "sideCapBps",
            "docs": [
              "Max exposure per side in basis points (copied from GlobalConfig at creation)"
            ],
            "type": "u16"
          },
          {
            "name": "isPaused",
            "docs": [
              "Pool-level pause flag (blocks new trades/epochs)"
            ],
            "type": "bool"
          },
          {
            "name": "isFrozen",
            "docs": [
              "Pool-level freeze flag (emergency halt)"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "poolCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "docs": [
              "Pool account pubkey"
            ],
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "docs": [
              "Asset mint this pool tracks"
            ],
            "type": "pubkey"
          },
          {
            "name": "walletCapBps",
            "docs": [
              "Max position per wallet in basis points (copied from GlobalConfig)"
            ],
            "type": "u16"
          },
          {
            "name": "sideCapBps",
            "docs": [
              "Max exposure per side in basis points (copied from GlobalConfig)"
            ],
            "type": "u16"
          }
        ]
      }
    }
  ]
};
