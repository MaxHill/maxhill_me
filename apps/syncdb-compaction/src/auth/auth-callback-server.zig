const std = @import("std");
const log = std.log;
const net = std.Io.net;
const Io = std.Io;
const Request = std.http.Server.Request;
const assert = std.debug.assert;

const MAX_BUF = 1024;

pub fn listen(io: Io, port: u16, code: *[]u8) !void {
    const addr = try net.IpAddress.parse("127.0.0.1", port);
    var server = try addr.listen(io, .{ .reuse_address = true });
    defer server.deinit(io);

    var wait_for_connection = true;
    while (wait_for_connection) {
        const stream = server.accept(io) catch |err| {
            log.err("failed to accept connection: {s}", .{@errorName(err)});
            continue;
        };
        // No need to spawn a thread since we're only looking for 1
        // callback request
        try accept(stream, io, code);
        wait_for_connection = false;
    }
}

fn accept(stream: net.Stream, io: Io, code: *[]u8) !void {
    defer stream.close(io);

    log.info("Got new client!", .{});

    var recv_buffer: [1024 * 10]u8 = undefined;
    var send_buffer: [100]u8 = undefined;
    var stream_reader = stream.reader(io, &recv_buffer);
    var stream_writer = stream.writer(io, &send_buffer);
    var server = std.http.Server.init(
        &stream_reader.interface,
        &stream_writer.interface,
    );
    while (server.reader.state == .ready) {
        var request = server.receiveHead() catch |err| switch (err) {
            // TODO: How should we handle HttpConnectionClosing?
            error.HttpConnectionClosing => return,
            else => return err,
        };

        switch (request.upgradeRequested()) {
            .other => |other_protocol| {
                // TODO: Assert false here
                log.err("Not supported protocol, {s}", .{other_protocol});
                return;
            },
            .websocket => {
                // TODO: Assert false here
                log.err("Not supported protocol, websocket", .{});
                return;
            },
            .none => {
                const target = request.head.target;
                const returned_code = try code_from_path(target);

                try request.respond(
                    "Authentication successfull! \nBack to the terminal, nerd",
                    .{},
                );

                // TODO(max): I should document this pattern and truly understand it.
                // This is the outline:
                // This is the pattern to copy bytes over to a buffer.
                // This is paired with the call-site:
                // var code_buffer: [1 * MiB]u8 = undefined;
                // var code: []u8 = &code_buffer;
                if (returned_code.len > code.*.len) return error.CodeBufferTooSmall;
                @memcpy(code.*[0..returned_code.len], returned_code);
                code.* = code.*[0..returned_code.len];
            },
        }
    }
}

pub fn code_from_path(target: []const u8) ![]const u8 {
    if (std.mem.findScalar(u8, target, '?')) |index| {
        const query_string = target[index + 1 ..];
        var query_list = std.mem.splitScalar(u8, query_string, '&');
        while (query_list.next()) |query_parameter| {
            var parameter = std.mem.splitScalar(u8, query_parameter, '=');

            const key = parameter.next() orelse continue;
            if (!std.mem.eql(u8, key, "code")) continue;

            const value = parameter.next() orelse return error.CodeParameterHasNoValue;
            if (value.len == 0) return error.CodeParameterHasNoValue;
            return value;
        }
        return error.CodeParameterNotFound;
    }
    return error.NoQueryParameter;
}

test "Parse errors" {
    try std.testing.expectError(
        error.NoQueryParameter,
        code_from_path("/callback"),
    );

    try std.testing.expectError(
        error.CodeParameterNotFound,
        code_from_path("/callback?param1=123"),
    );

    try std.testing.expectError(
        error.CodeParameterHasNoValue,
        code_from_path("/callback?code"),
    );

    try std.testing.expectError(
        error.CodeParameterHasNoValue,
        code_from_path("/callback?code="),
    );
    try std.testing.expectError(
        error.CodeParameterHasNoValue,
        code_from_path("/callback?code=&other_query_param"),
    );
}

test "Parse code successfully" {
    var code = try code_from_path("/callback?code=value&param=value");
    assert(std.mem.eql(u8, "value", code));

    code = try code_from_path("/callback?code=value");
    assert(std.mem.eql(u8, "value", code));

    code = try code_from_path("/callback?some_other_param&code=value");
    assert(std.mem.eql(u8, "value", code));
}
