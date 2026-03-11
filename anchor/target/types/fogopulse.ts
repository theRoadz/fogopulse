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
    }
  ],
  "events": [
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
    }
  ],
  "types": [
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
    }
  ]
};
