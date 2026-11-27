const std = @import("std");
const stdx = @import("stdx");
const log = std.log;
const net = std.Io.net;
const Io = std.Io;
const Request = std.http.Server.Request;
const assert = std.debug.assert;

const KiB = stdx.KiB;

pub fn listen(io: Io, port: u16, code: *[]u8, state: *const [64]u8) !void {
    const addr = try net.IpAddress.parse("127.0.0.1", port);
    var server = try addr.listen(io, .{ .reuse_address = true });
    defer server.deinit(io);

    while (true) {
        const stream = server.accept(io) catch |err| {
            log.err("failed to accept connection: {s}", .{@errorName(err)});
            continue;
        };
        // No need to spawn a thread since we're only looking for 1
        // callback request
        try accept(stream, io, code, state);
        break;
    }
}

fn accept(stream: net.Stream, io: Io, code: *[]u8, state: *const [64]u8) !void {
    defer stream.close(io);

    var recv_buffer: [10 * KiB]u8 = undefined;
    var send_buffer: [100]u8 = undefined;
    var stream_reader = stream.reader(io, &recv_buffer);
    var stream_writer = stream.writer(io, &send_buffer);
    var server = std.http.Server.init(
        &stream_reader.interface,
        &stream_writer.interface,
    );

    while (server.reader.state == .ready) {
        var request = server.receiveHead() catch |err| switch (err) {
            error.HttpConnectionClosing => return,
            else => return err,
        };

        switch (request.upgradeRequested()) {
            .other => |other_protocol| {
                log.err("Not supported protocol, {s}", .{other_protocol});
                assert(false);
                return;
            },
            .websocket => {
                log.err("Not supported protocol, websocket", .{});
                assert(false);
                return;
            },
            .none => {
                const target = request.head.target;
                if (!std.mem.startsWith(u8, target, "/callback")) return;

                const received_code, const received_state =
                    try parse_authorization_callback(target);
                if (!std.mem.eql(u8, received_state, state)) {
                    return error.InvalidState;
                }

                try request.respond(
                    "Authentication successfull! \nBack to the terminal, nerd",
                    .{},
                );

                if (received_code.len > code.*.len) return error.CodeBufferTooSmall;
                @memcpy(code.*[0..received_code.len], received_code);
                code.* = code.*[0..received_code.len];
            },
        }
    }
}

pub fn parse_authorization_callback(target: []const u8) !struct { []const u8, []const u8 } {
    const index = std.mem.findScalar(u8, target, '?') orelse
        return error.NoQueryParameter;
    var code: ?[]const u8 = null;
    var state: ?[]const u8 = null;

    const query_string = target[index + 1 ..];
    var query_list = std.mem.splitScalar(u8, query_string, '&');
    while (query_list.next()) |parameter| {
        const equals = std.mem.findScalar(u8, parameter, '=') orelse
            parameter.len;
        const key = parameter[0..equals];
        const value = if (equals < parameter.len)
            parameter[equals + 1 ..]
        else
            "";

        if (std.mem.eql(u8, key, "state")) {
            if (state != null) return error.DuplicateState;
            state = value;
        } else if (std.mem.eql(u8, key, "code")) {
            if (code != null) return error.DuplicateCode;
            code = value;
        }
    }

    // State is ususally optional in OAuth2 but we require it here since it
    // provides protection against CSRF attacks.
    const received_state = state orelse return error.StateParameterNotFound;
    if (received_state.len == 0) return error.StateParameterHasNoValue;

    const received_code = code orelse return error.CodeParameterNotFound;
    if (received_code.len == 0) return error.CodeParameterHasNoValue;
    return .{ received_code, received_state };
}

test "Parse errors" {
    try std.testing.expectError(
        error.NoQueryParameter,
        parse_authorization_callback("/callback"),
    );

    try std.testing.expectError(
        error.CodeParameterNotFound,
        parse_authorization_callback("/callback?param1=123"),
    );

    try std.testing.expectError(
        error.CodeParameterHasNoValue,
        parse_authorization_callback("/callback?code"),
    );

    try std.testing.expectError(
        error.CodeParameterHasNoValue,
        parse_authorization_callback("/callback?code="),
    );
    try std.testing.expectError(
        error.CodeParameterHasNoValue,
        parse_authorization_callback("/callback?code=&other_query_param"),
    );
}

test "Parse code successfully" {
    var code = try parse_authorization_callback("/callback?code=value&param=value");
    assert(std.mem.eql(u8, "value", code));

    code = try parse_authorization_callback("/callback?code=value");
    assert(std.mem.eql(u8, "value", code));

    code = try parse_authorization_callback("/callback?some_other_param&code=value");
    assert(std.mem.eql(u8, "value", code));
}
