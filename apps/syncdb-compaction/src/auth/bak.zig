const std = @import("std");
const stdx = @import("stdx");
const assert = std.debug.assert;
const http = std.http;
const auth_callback_server = @import("./auth-callback-server.zig");
const KiB = stdx.KiB;

// TODO: rename AuthInit to something more fitting
const AuthInit = struct { arena: std.mem.Allocator, io: std.Io };

const AuthApiClient = struct {
    issuer_url: []const u8,
    jwk_url: []u8,
    jwk_uri: std.Uri,
    client: http.Client,
    arena: std.mem.Allocator,

    pub fn init(config: AuthInit, issuer_url: []const u8) !@This() {
        const jwk_url = try std.fmt.allocPrint(config.arena, "{s}{s}", .{ issuer_url, "/.well-known/jwks.json" });
        errdefer config.arena.free(jwk_url);
        const jwk_uri = try std.Uri.parse(jwk_url);

        return .{
            .issuer_url = issuer_url,
            .jwk_url = jwk_url,
            .jwk_uri = jwk_uri,
            .client = .{ .allocator = config.arena, .io = config.io },
            .arena = config.arena,
        };
    }

    pub fn deinit(self: *@This()) void {
        defer self.client.deinit();
        defer self.arena.free(self.jwk_url);
    }

    pub fn fetch_jwks(self: *@This()) ![]u8 {
        var req = try self.client.request(.GET, self.jwk_uri, .{
            .extra_headers = &.{.{ .name = "Custom-header", .value = "Custom Value" }},
        });
        defer req.deinit();

        std.debug.print("Sending request\n", .{});
        try req.sendBodiless();

        var redirect_buffer: [1024]u8 = undefined;
        var response = try req.receiveHead(&redirect_buffer);
        var iter = response.head.iterateHeaders();
        while (iter.next()) |header| {
            std.debug.print("Name:{s}, Value:{s}\n", .{ header.name, header.value });
        }

        if (response.head.status != .ok) {
            return error.StatusNotOk;
        }
        const body = try response.reader(&.{}).allocRemaining(self.arena, .unlimited);

        return body;
    }
};
