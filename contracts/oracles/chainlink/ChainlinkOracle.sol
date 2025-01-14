// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.6;

import "@yield-protocol/vault-interfaces/IOracle.sol";
import "./AggregatorV3Interface.sol";

/**
 * @title ChainlinkOracle
 */
contract ChainlinkOracle is IOracle {


    address public immutable source;
    uint256 public immutable scaleFactor;
    uint8 public constant override decimals = 18;   // All prices are converted to 18 decimals

    constructor(address source_) {
        source = source_;
        uint256 decimals_ = AggregatorV3Interface(source_).decimals();
        require (decimals_ <= 18, "Unsupported decimals"); 
        scaleFactor = 10 ** (18 - decimals_);
    }

    /**
     * @notice Retrieve the latest price of the price oracle.
     * @return price
     */
    function _peek() private view returns (uint price, uint updateTime) {
        int rawPrice;
        uint80 roundId;
        uint80 answeredInRound;
        (roundId, rawPrice,, updateTime, answeredInRound) = AggregatorV3Interface(source).latestRoundData();
        require(rawPrice > 0, "Chainlink price <= 0");
        require(updateTime != 0, "Incomplete round");
        require(answeredInRound >= roundId, "Stale price");
        price = uint(rawPrice) * scaleFactor;
    }

    /**
     * @notice Retrieve the value of the amount at the latest oracle price.
     */
    function peek(bytes32, bytes32, uint256 amount)
        external view virtual override
        returns (uint256 value, uint256 updateTime)
    {
        uint256 price;
        (price, updateTime) = _peek();
        value = price * amount / 1e18;
    }

    /**
     * @notice Retrieve the value of the amount at the latest oracle price.. Same as `peek` for this oracle.
     */
    function get(bytes32, bytes32, uint256 amount)
        external virtual override
        returns (uint256 value, uint256 updateTime)
    {
        uint256 price;
        (price, updateTime) = _peek();
        value = price * amount / 1e18;
    }
}
