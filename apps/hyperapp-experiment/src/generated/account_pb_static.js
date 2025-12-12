/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const account = $root.account = (() => {

    /**
     * Namespace account.
     * @exports account
     * @namespace
     */
    const account = {};

    account.PingRequest = (function() {

        /**
         * Properties of a PingRequest.
         * @memberof account
         * @interface IPingRequest
         * @property {number|Long|null} [ping] PingRequest ping
         */

        /**
         * Constructs a new PingRequest.
         * @memberof account
         * @classdesc Represents a PingRequest.
         * @implements IPingRequest
         * @constructor
         * @param {account.IPingRequest=} [properties] Properties to set
         */
        function PingRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PingRequest ping.
         * @member {number|Long} ping
         * @memberof account.PingRequest
         * @instance
         */
        PingRequest.prototype.ping = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

        /**
         * Creates a new PingRequest instance using the specified properties.
         * @function create
         * @memberof account.PingRequest
         * @static
         * @param {account.IPingRequest=} [properties] Properties to set
         * @returns {account.PingRequest} PingRequest instance
         */
        PingRequest.create = function create(properties) {
            return new PingRequest(properties);
        };

        /**
         * Encodes the specified PingRequest message. Does not implicitly {@link account.PingRequest.verify|verify} messages.
         * @function encode
         * @memberof account.PingRequest
         * @static
         * @param {account.IPingRequest} message PingRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PingRequest.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.ping != null && Object.hasOwnProperty.call(message, "ping"))
                writer.uint32(/* id 1, wireType 0 =*/8).int64(message.ping);
            return writer;
        };

        /**
         * Encodes the specified PingRequest message, length delimited. Does not implicitly {@link account.PingRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof account.PingRequest
         * @static
         * @param {account.IPingRequest} message PingRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PingRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a PingRequest message from the specified reader or buffer.
         * @function decode
         * @memberof account.PingRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {account.PingRequest} PingRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PingRequest.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.account.PingRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.ping = reader.int64();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a PingRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof account.PingRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {account.PingRequest} PingRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PingRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a PingRequest message.
         * @function verify
         * @memberof account.PingRequest
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        PingRequest.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.ping != null && message.hasOwnProperty("ping"))
                if (!$util.isInteger(message.ping) && !(message.ping && $util.isInteger(message.ping.low) && $util.isInteger(message.ping.high)))
                    return "ping: integer|Long expected";
            return null;
        };

        /**
         * Creates a PingRequest message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof account.PingRequest
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {account.PingRequest} PingRequest
         */
        PingRequest.fromObject = function fromObject(object) {
            if (object instanceof $root.account.PingRequest)
                return object;
            let message = new $root.account.PingRequest();
            if (object.ping != null)
                if ($util.Long)
                    (message.ping = $util.Long.fromValue(object.ping)).unsigned = false;
                else if (typeof object.ping === "string")
                    message.ping = parseInt(object.ping, 10);
                else if (typeof object.ping === "number")
                    message.ping = object.ping;
                else if (typeof object.ping === "object")
                    message.ping = new $util.LongBits(object.ping.low >>> 0, object.ping.high >>> 0).toNumber();
            return message;
        };

        /**
         * Creates a plain object from a PingRequest message. Also converts values to other types if specified.
         * @function toObject
         * @memberof account.PingRequest
         * @static
         * @param {account.PingRequest} message PingRequest
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        PingRequest.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.defaults)
                if ($util.Long) {
                    let long = new $util.Long(0, 0, false);
                    object.ping = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.ping = options.longs === String ? "0" : 0;
            if (message.ping != null && message.hasOwnProperty("ping"))
                if (typeof message.ping === "number")
                    object.ping = options.longs === String ? String(message.ping) : message.ping;
                else
                    object.ping = options.longs === String ? $util.Long.prototype.toString.call(message.ping) : options.longs === Number ? new $util.LongBits(message.ping.low >>> 0, message.ping.high >>> 0).toNumber() : message.ping;
            return object;
        };

        /**
         * Converts this PingRequest to JSON.
         * @function toJSON
         * @memberof account.PingRequest
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        PingRequest.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for PingRequest
         * @function getTypeUrl
         * @memberof account.PingRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PingRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/account.PingRequest";
        };

        return PingRequest;
    })();

    account.PingResponse = (function() {

        /**
         * Properties of a PingResponse.
         * @memberof account
         * @interface IPingResponse
         * @property {number|Long|null} [pong] PingResponse pong
         */

        /**
         * Constructs a new PingResponse.
         * @memberof account
         * @classdesc Represents a PingResponse.
         * @implements IPingResponse
         * @constructor
         * @param {account.IPingResponse=} [properties] Properties to set
         */
        function PingResponse(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PingResponse pong.
         * @member {number|Long} pong
         * @memberof account.PingResponse
         * @instance
         */
        PingResponse.prototype.pong = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

        /**
         * Creates a new PingResponse instance using the specified properties.
         * @function create
         * @memberof account.PingResponse
         * @static
         * @param {account.IPingResponse=} [properties] Properties to set
         * @returns {account.PingResponse} PingResponse instance
         */
        PingResponse.create = function create(properties) {
            return new PingResponse(properties);
        };

        /**
         * Encodes the specified PingResponse message. Does not implicitly {@link account.PingResponse.verify|verify} messages.
         * @function encode
         * @memberof account.PingResponse
         * @static
         * @param {account.IPingResponse} message PingResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PingResponse.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.pong != null && Object.hasOwnProperty.call(message, "pong"))
                writer.uint32(/* id 1, wireType 0 =*/8).int64(message.pong);
            return writer;
        };

        /**
         * Encodes the specified PingResponse message, length delimited. Does not implicitly {@link account.PingResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof account.PingResponse
         * @static
         * @param {account.IPingResponse} message PingResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PingResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a PingResponse message from the specified reader or buffer.
         * @function decode
         * @memberof account.PingResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {account.PingResponse} PingResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PingResponse.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.account.PingResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.pong = reader.int64();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a PingResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof account.PingResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {account.PingResponse} PingResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PingResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a PingResponse message.
         * @function verify
         * @memberof account.PingResponse
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        PingResponse.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.pong != null && message.hasOwnProperty("pong"))
                if (!$util.isInteger(message.pong) && !(message.pong && $util.isInteger(message.pong.low) && $util.isInteger(message.pong.high)))
                    return "pong: integer|Long expected";
            return null;
        };

        /**
         * Creates a PingResponse message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof account.PingResponse
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {account.PingResponse} PingResponse
         */
        PingResponse.fromObject = function fromObject(object) {
            if (object instanceof $root.account.PingResponse)
                return object;
            let message = new $root.account.PingResponse();
            if (object.pong != null)
                if ($util.Long)
                    (message.pong = $util.Long.fromValue(object.pong)).unsigned = false;
                else if (typeof object.pong === "string")
                    message.pong = parseInt(object.pong, 10);
                else if (typeof object.pong === "number")
                    message.pong = object.pong;
                else if (typeof object.pong === "object")
                    message.pong = new $util.LongBits(object.pong.low >>> 0, object.pong.high >>> 0).toNumber();
            return message;
        };

        /**
         * Creates a plain object from a PingResponse message. Also converts values to other types if specified.
         * @function toObject
         * @memberof account.PingResponse
         * @static
         * @param {account.PingResponse} message PingResponse
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        PingResponse.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.defaults)
                if ($util.Long) {
                    let long = new $util.Long(0, 0, false);
                    object.pong = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.pong = options.longs === String ? "0" : 0;
            if (message.pong != null && message.hasOwnProperty("pong"))
                if (typeof message.pong === "number")
                    object.pong = options.longs === String ? String(message.pong) : message.pong;
                else
                    object.pong = options.longs === String ? $util.Long.prototype.toString.call(message.pong) : options.longs === Number ? new $util.LongBits(message.pong.low >>> 0, message.pong.high >>> 0).toNumber() : message.pong;
            return object;
        };

        /**
         * Converts this PingResponse to JSON.
         * @function toJSON
         * @memberof account.PingResponse
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        PingResponse.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for PingResponse
         * @function getTypeUrl
         * @memberof account.PingResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PingResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/account.PingResponse";
        };

        return PingResponse;
    })();

    return account;
})();

export { $root as default };
