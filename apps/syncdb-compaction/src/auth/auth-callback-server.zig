const std = @import("std");
const log = std.log;
const net = std.Io.net;
const Io = std.Io;
const Request = std.http.Server.Request;
const assert = std.debug.assert;

const MAX_BUF = 1024;

pub fn listen(io: Io, port: u16) !void {
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
        try accept(stream, io);
        wait_for_connection = false;
    }
}

fn accept(stream: net.Stream, io: Io) !void {
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
            error.HttpConnectionClosing => return,
            else => return err,
        };

        switch (request.upgradeRequested()) {
            .other => |other_protocol| {
                log.err("Not supported protocol, {s}", .{other_protocol});
                return;
            },
            .websocket => {
                log.err("Not supported protocol, websocket", .{});
                return;
            },
            .none => {
                try serveHTTP(&request);
            },
        }
    }
}

const AuthCallbackQueryParams = struct {
    code: []const u8,
    state: []const u8,

    pub fn from_path(target: []const u8) !@This() {
        var code: []const u8 = "";
        var state: []const u8 = "";
        if (std.mem.findScalar(u8, target, '?')) |index| {
            const query_string = target[index + 1 ..];
            var query_list = std.mem.splitScalar(u8, query_string, '&');
            while (query_list.next()) |query_parameter| {
                var parameter = std.mem.splitScalar(u8, query_parameter, '=');
                if (parameter.next()) |key| {
                    const value = parameter.next();
                    if (std.mem.eql(u8, key, "code")) {
                        assert(value != null);
                        code = value.?;
                        continue;
                    }
                    if (std.mem.eql(u8, key, "state") and value != null) {
                        state = value.?;
                        continue;
                    }
                } else {
                    // TODO(max): This branch needs to be handled
                    // No '=' found for query parameter.
                    // This needs to be handled as a &thing which is a valid query parameter
                    assert(false);
                }
            }
        } else {
            // No query parameters present on the path
            return error.NoQueryParameter;
        }
        return .{ .code = code, .state = state };
    }
};

test "Parse without params" {
    const target = "/callback";
    const params = AuthCallbackQueryParams.from_path(target);
    try std.testing.expectError(error.NoQueryParameter, params);
}

test "Parse with params" {
    const target = "/callback?param=value";
    const params = try AuthCallbackQueryParams.from_path(target);
    assert(std.mem.eql(u8, "", params.code));
    assert(std.mem.eql(u8, "", params.state));
}

fn serveHTTP(request: *Request) !void {
    const target = request.head.target;
    std.debug.print("path={s}\n", .{target});
    const params = try AuthCallbackQueryParams.from_path(target);
    std.debug.print("params=[{s},{s}]\n", .{ params.code, params.state });
    // var split = std.mem.splitScalar(u8, target, '?');
    // _ = split.next();
    // if (split.next()) |query_string| {
    //     var query_list = std.mem.splitScalar(u8, query_string, '&');
    //     while (query_list.next()) |query_parameter| {
    //         var it2 = std.mem.splitScalar(u8, query_parameter, '=');
    //         const key = it2.next() orelse "none";
    //         const value = it2.next() orelse "void";
    //         std.debug.print("key={s},value={s}\n", .{ key, value });
    //     }
    // } else {
    //     assert(false);
    // }
    // const pairs = target.split();
    try request.respond(
        "Hello World from Zig HTTP server",
        .{
            .extra_headers = &.{
                .{ .name = "custom-header", .value = "custom value" },
            },
        },
    );
}
