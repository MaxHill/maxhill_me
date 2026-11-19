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

    var recv_buffer: [1024]u8 = undefined;
    var send_buffer: [100]u8 = undefined;
    var stream_reader = stream.reader(io, &recv_buffer);
    var stream_writer = stream.writer(io, &send_buffer);
    var server = std.http.Server.init(&stream_reader.interface, &stream_writer.interface);
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

fn serveHTTP(request: *Request) !void {
    try request.respond(
        "Hello World from Zig HTTP server",
        .{
            .extra_headers = &.{
                .{ .name = "custom-header", .value = "custom value" },
            },
        },
    );
}
