const std = @import("std");
const assert = std.debug.assert;
const http = std.http;
const auth_callback_server = @import("./auth-callback-server.zig");

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

pub const PKCE = struct {
    code_verifier: []const u8,
    code_challenge: []const u8,
    arena: std.mem.Allocator,

    pub fn init(config: AuthInit) !PKCE {
        // Generate 128-character code verifier (64 random bytes, hex-encoded)
        // RFC 7636 requires 43-128 characters
        const rng_impl: std.Random.IoSource = .{ .io = config.io };
        const secureRand = rng_impl.interface();

        var verifier_buf: [64]u8 = undefined;
        secureRand.bytes(&verifier_buf);

        var encoded_buf: [128]u8 = undefined;
        const verifier = std.fmt.bytesToHex(verifier_buf, .lower);
        @memcpy(encoded_buf[0..verifier.len], &verifier);

        const owned_verifier = try config.arena.dupe(u8, encoded_buf[0..verifier.len]);
        errdefer config.arena.free(owned_verifier);

        // Generate code challenge (SHA256 hash of verifier, base64url encoded per RFC 7636)
        var hash: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(owned_verifier, &hash, .{});

        // Base64url encode the hash (no padding) per RFC 7636
        const encoder = std.base64.url_safe_no_pad.Encoder;
        var challenge_buf: [64]u8 = undefined;
        const challenge = encoder.encode(&challenge_buf, &hash);
        const owned_challenge = try config.arena.dupe(u8, challenge);

        return .{
            .code_verifier = owned_verifier,
            .code_challenge = owned_challenge,
            .arena = config.arena,
        };
    }

    pub fn deinit(self: @This()) void {
        self.arena.free(self.code_challenge);
        self.arena.free(self.code_verifier);
    }
};

pub const OAuth2Config = struct {
    client_id: []const u8,
    client_secret: ?[]const u8,
    authorization_endpoint: []const u8,
    token_endpoint: []const u8,
    redirect_uri: ?[]const u8,
    scope: ?[]const u8,
    allocator: std.mem.Allocator,

    pub fn init(
        allocator: std.mem.Allocator,
        client_id: []const u8,
        authorization_endpoint: []const u8,
        token_endpoint: []const u8,
    ) !@This() {
        const owned_client_id = try allocator.dupe(u8, client_id);
        errdefer allocator.free(owned_client_id);
        const owned_authorization_endpoint = try allocator.dupe(u8, authorization_endpoint);
        errdefer allocator.free(owned_authorization_endpoint);
        const owned_token_endpoint = try allocator.dupe(u8, token_endpoint);

        return .{
            .allocator = allocator,
            .client_id = owned_client_id,
            .authorization_endpoint = owned_authorization_endpoint,
            .token_endpoint = owned_token_endpoint,
            .redirect_uri = null,
            .scope = null,
            .client_secret = null,
        };
    }

    pub fn deinit(self: *OAuth2Config) void {
        self.allocator.free(self.client_id);
        self.allocator.free(self.authorization_endpoint);
        self.allocator.free(self.token_endpoint);

        if (self.client_secret) |cs| {
            // Zero sensitive data before freeing
            @memset(@constCast(cs), 0);
            self.allocator.free(cs);
        }

        if (self.redirect_uri) |uri| self.allocator.free(uri);
        if (self.scope) |scope| self.allocator.free(scope);
    }

    pub fn set_client_secret(self: *OAuth2Config, client_secret: []const u8) !void {
        const owned = try self.allocator.dupe(u8, client_secret);
        if (self.client_secret) |old_cs| {
            // Zero sensitive data before freeing
            @memset(@constCast(old_cs), 0);
            self.allocator.free(old_cs);
        }
        self.client_secret = owned;
    }

    pub fn set_redirect_uri(self: *OAuth2Config, redirect_uri: []const u8) !void {
        const owned = try self.allocator.dupe(u8, redirect_uri);
        if (self.redirect_uri) |old_redirect_uri| {
            // Zero sensitive data before freeing
            @memset(@constCast(old_redirect_uri), 0);
            self.allocator.free(old_redirect_uri);
        }
        self.redirect_uri = owned;
    }

    pub fn set_scope(self: *OAuth2Config, scope: []const u8) !void {
        const owned = try self.allocator.dupe(u8, scope);
        if (self.scope) |old_scope| {
            // Zero sensitive data before freeing
            @memset(@constCast(old_scope), 0);
            self.allocator.free(old_scope);
        }
        self.scope = owned;
    }
};

pub const OAuth2Client = struct {
    config: OAuth2Config,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator, config: OAuth2Config) @This() {
        return .{ .allocator = allocator, .config = config };
    }

    pub fn buildAuthorizationUrl(
        self: *const OAuth2Client,
        state: ?[]const u8,
        pkce: ?*const PKCE,
    ) ![]const u8 {
        var buffer: std.ArrayList(u8) = .empty;
        defer buffer.deinit(self.allocator);

        try buffer.appendSlice(self.allocator, self.config.authorization_endpoint);
        try buffer.appendSlice(self.allocator, "?response_type=code");
        try buffer.appendSlice(self.allocator, "&client_id=");
        try buffer.appendSlice(self.allocator, self.config.client_id);

        if (self.config.redirect_uri) |ru| {
            try buffer.appendSlice(self.allocator, "&redirect_uri=");
            try self.appendUrlEncoded(&buffer, ru);
        }

        if (self.config.scope) |scope| {
            try buffer.appendSlice(self.allocator, "&scope=");
            try self.appendUrlEncoded(&buffer, scope);
        }

        if (state) |s| {
            try buffer.appendSlice(self.allocator, "&state=");
            try self.appendUrlEncoded(&buffer, s);
        }

        if (pkce) |p| {
            try buffer.appendSlice(self.allocator, "&code_challenge=");
            try buffer.appendSlice(self.allocator, p.code_challenge);
            try buffer.appendSlice(self.allocator, "&code_challenge_method=S256");
        }

        return buffer.toOwnedSlice(self.allocator);
    }

    fn appendUrlEncoded(
        self: *const OAuth2Client,
        buffer: *std.ArrayList(u8),
        str: []const u8,
    ) !void {
        for (str) |c| {
            switch (c) {
                'A'...'Z', 'a'...'z', '0'...'9', '-', '_', '.', '~' => {
                    try buffer.append(self.allocator, c);
                },
                ' ' => {
                    try buffer.append(self.allocator, '+');
                },
                else => {
                    try buffer.appendSlice(self.allocator, "%");
                    var hex_buf: [2]u8 = undefined;
                    _ = try std.fmt.bufPrint(&hex_buf, "{X:0>2}", .{c});
                    try buffer.appendSlice(self.allocator, &hex_buf);
                },
            }
        }
    }
};

test "config owns its strings and setters accept their current values" {
    var config = try OAuth2Config.init(std.testing.allocator, "client", "https://example.com/authorize", "https://example.com/token");
    defer config.deinit();

    try config.set_client_secret("secret");
    try config.set_client_secret(config.client_secret.?);
    try config.set_redirect_uri("https://localhost/callback");
    try config.set_redirect_uri(config.redirect_uri.?);
    try config.set_scope("read write");
    try config.set_scope(config.scope.?);
    try std.testing.expectEqualStrings("secret", config.client_secret.?);
    try std.testing.expectEqualStrings("https://localhost/callback", config.redirect_uri.?);
    try std.testing.expectEqualStrings("read write", config.scope.?);
}

test "authorization URL encodes optional parameters" {
    var config = try OAuth2Config.init(std.testing.allocator, "client", "https://example.com/authorize", "https://example.com/token");
    defer config.deinit();
    try config.set_redirect_uri("https://localhost/callback");
    try config.set_scope("read write");
    const client = OAuth2Client.init(std.testing.allocator, config);
    const url = try client.buildAuthorizationUrl("a&b", null);
    defer std.testing.allocator.free(url);
    try std.testing.expectEqualStrings("https://example.com/authorize?response_type=code&client_id=client&redirect_uri=https%3A%2F%2Flocalhost%2Fcallback&scope=read+write&state=a%26b", url);
}

// https://whit3rabbit.github.io/zig-bbq-cookbook/04-specialized/11-network-web/12-oauth2-authentication.html
pub fn main(init: AuthInit) !void {
    var api_client = try AuthApiClient.init(init, "http://localhost:3002");
    defer api_client.deinit();

    var config = try OAuth2Config.init(
        init.arena,
        "my_client_id",
        "http://localhost:3002/authorize",
        "http://localhost:3002/token",
    );
    defer config.deinit();

    try config.set_redirect_uri("http://localhost:9999/callback");
    // try config.setScope("read write");

    const pkce = try PKCE.init(init);
    defer pkce.deinit();
    std.debug.print(
        "PKCE:\nverifier: {s}\nchallenge: {s}\n",
        .{ pkce.code_verifier, pkce.code_challenge },
    );

    var client = OAuth2Client.init(init.arena, config);

    // Step 1: Build authorization URL
    const auth_url = try client.buildAuthorizationUrl("random_state_123", &pkce);
    defer init.arena.free(auth_url);

    // Print the authorization URL to stdout so it appears in the debugger's
    // program-output stream rather than only in LLDB diagnostics.
    var stdout_buffer: [1024]u8 = undefined;
    var stdout_file_writer: std.Io.File.Writer = .init(.stdout(), init.io, &stdout_buffer);
    const stdout_writer = &stdout_file_writer.interface;
    try stdout_writer.print("{s}\n", .{auth_url});
    try stdout_writer.flush();

    try auth_callback_server.listen(init.io, 9999);

    //     // Step 2: After callback, exchange code for token
    // var token = try client.exchangeAuthorizationCode("received_code", &pkce);
    // defer token.deinit();
    //
    //
    // // Step 3: Use token for API requests
    // const auth_header = try token.getAuthorizationHeader();
    // defer allocator.free(auth_header);
    // // Authorization: Bearer access_token_12345

    const response = try api_client.fetch_jwks();
    defer init.arena.free(response);
    std.debug.print("Body:\n{s}\n", .{response});

    // Generate
}
