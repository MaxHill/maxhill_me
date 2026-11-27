const std = @import("std");
const stdx = @import("stdx");
const assert = std.debug.assert;
const http = std.http;
const auth_callback_server = @import("./auth-callback-server.zig");

const KiB = stdx.KiB;

// TODO: rename AuthInit to something more fitting
const AuthInit = struct { arena: std.mem.Allocator, io: std.Io };

pub const PKCE = struct {
    code_verifier: []const u8,
    code_challenge: []const u8,
    arena: std.mem.Allocator,

    pub fn init(io: std.Io, arena: std.mem.Allocator) !PKCE {
        // Generate 128-character code verifier (64 random bytes, hex-encoded)
        // RFC 7636 requires 43-128 characters
        const rng_impl: std.Random.IoSource = .{ .io = io };
        const secureRand = rng_impl.interface();

        var verifier_buf: [64]u8 = undefined;
        secureRand.bytes(&verifier_buf);

        var encoded_buf: [128]u8 = undefined;
        const verifier = std.fmt.bytesToHex(verifier_buf, .lower);
        @memcpy(encoded_buf[0..verifier.len], &verifier);

        const owned_verifier = try arena.dupe(u8, encoded_buf[0..verifier.len]);
        errdefer arena.free(owned_verifier);

        // Generate code challenge (SHA256 hash of verifier, base64url encoded per RFC 7636)
        var hash: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(owned_verifier, &hash, .{});

        // Base64url encode the hash (no padding) per RFC 7636
        const encoder = std.base64.url_safe_no_pad.Encoder;
        var challenge_buf: [64]u8 = undefined;
        const challenge = encoder.encode(&challenge_buf, &hash);
        const owned_challenge = try arena.dupe(u8, challenge);

        return .{
            .code_verifier = owned_verifier,
            .code_challenge = owned_challenge,
            .arena = arena,
        };
    }

    pub fn deinit(self: @This()) void {
        self.arena.free(self.code_challenge);
        self.arena.free(self.code_verifier);
    }
};

pub const OAuth2Config = struct {
    allocator: std.mem.Allocator,
    client_id: []const u8,
    authorization_endpoint: []const u8,
    client_secret: ?[]const u8,
    token_endpoint: []const u8,
    redirect_uri: ?[]const u8,
    scope: ?[]const u8,

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

    pub fn exchangeAuthorizationCode(self: *const OAuth2Client, code: []const u8, pkce: ?*const PKCE, io: std.Io) !OAuth2Token {
        var client = std.http.Client{ .allocator = self.allocator, .io = io };
        defer client.deinit();

        // Build request body
        var body: std.ArrayList(u8) = .empty;
        defer body.deinit(self.allocator);

        try body.appendSlice(self.allocator, "grant_type=authorization_code");
        try body.appendSlice(self.allocator, "&code=");
        try body.appendSlice(self.allocator, code);
        try body.appendSlice(self.allocator, "&client_id=");
        try body.appendSlice(self.allocator, self.config.client_id);

        if (self.config.redirect_uri) |uri| {
            try body.appendSlice(self.allocator, "&redirect_uri=");
            try self.appendUrlEncoded(&body, uri);
        }

        if (pkce) |p| {
            try body.appendSlice(self.allocator, "&code_verifier=");
            try body.appendSlice(self.allocator, p.code_verifier);
        }

        // Make POST request to token endpoint
        const token_endpoint = try std.Uri.parse(self.config.token_endpoint);
        var req = try client.request(.POST, token_endpoint, .{
            .extra_headers = &.{
                .{ .name = "Content-Type", .value = "application/x-www-form-urlencoded" },
            },
        });
        defer req.deinit();

        // req.transfer_encoding = .{ .content_length = body.items.len };
        try req.sendBodyComplete(body.items);

        var redirect_buffer: [1024]u8 = undefined;
        var response = try req.receiveHead(&redirect_buffer);
        var iter = response.head.iterateHeaders();
        while (iter.next()) |header| {
            std.debug.print("Name:{s}, Value:{s}\n", .{ header.name, header.value });
        }

        const received_body = try response.reader(&.{}).allocRemaining(
            self.allocator,
            .limited(16 * KiB),
        );
        defer self.allocator.free(received_body);

        if (response.head.status != .ok) {
            std.debug.print("Token exchange failed: {d}\n{s}\n", .{
                @backingInt(response.head.status),
                received_body,
            });
            return error.StatusNotOk;
        }

        std.debug.print("What's the received body now?", .{});
        // Parse JSON response into OAuth2Token
        const TokenResponse = struct {
            access_token: []const u8,
            token_type: []const u8 = "Bearer",
            expires_in: ?i64 = null,
            refresh_token: ?[]const u8 = null,
            scope: ?[]const u8 = null,
        };

        const token_response = try std.json.parseFromSlice(
            TokenResponse,
            self.allocator,
            received_body,
            .{},
        );
        defer token_response.deinit();

        return OAuth2Token.init(io, self.allocator, token_response.value.access_token, token_response.value.token_type);
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

pub const OAuth2Token = struct {
    access_token: []const u8,
    token_type: []const u8,
    expires_in: ?i64,
    refresh_token: ?[]const u8,
    scope: ?[]const u8,
    issued_at: i64,
    allocator: std.mem.Allocator,

    pub fn init(io: std.Io, allocator: std.mem.Allocator, access_token: []const u8, token_type: []const u8) !OAuth2Token {
        const owned_access_token = try allocator.dupe(u8, access_token);
        errdefer allocator.free(owned_access_token);

        const owned_token_type = try allocator.dupe(u8, token_type);
        errdefer allocator.free(owned_token_type);

        return .{
            .access_token = owned_access_token,
            .token_type = owned_token_type,
            .expires_in = null,
            .refresh_token = null,
            .scope = null,
            .issued_at = std.Io.Timestamp.now(io, std.Io.Clock.real).toMilliseconds(),
            .allocator = allocator,
        };
    }

    pub fn deinit(self: OAuth2Token) void {
        self.allocator.free(self.access_token);
        self.allocator.free(self.token_type);
        if (self.refresh_token) |value| self.allocator.free(value);
        if (self.scope) |value| self.allocator.free(value);
    }

    pub fn isExpired(self: *const OAuth2Token) bool {
        if (self.expires_in) |expires| {
            const now = std.time.timestamp();
            const elapsed = now - self.issued_at;
            return elapsed >= expires;
        }
        return false;
    }

    pub fn getAuthorizationHeader(self: *const OAuth2Token) ![]const u8 {
        var buffer: std.ArrayList(u8) = .empty;
        defer buffer.deinit(self.allocator);

        try buffer.appendSlice(self.allocator, self.token_type);
        try buffer.appendSlice(self.allocator, " ");
        try buffer.appendSlice(self.allocator, self.access_token);

        return buffer.toOwnedSlice(self.allocator);
    }
};

// https://whit3rabbit.github.io/zig-bbq-cookbook/04-specialized/11-network-web/12-oauth2-authentication.html
pub fn main(init: AuthInit) !void {
    // var api_client = try AuthApiClient.init(init, "http://localhost:3002");
    // defer api_client.deinit();
    //
    // const response = try api_client.fetch_jwks();
    // defer init.arena.free(response);
    // std.debug.print("Body:\n{s}\n", .{response});

    var config = try OAuth2Config.init(
        init.arena,
        "my_client_id",
        "http://localhost:3002/authorize",
        "http://localhost:3002/token",
    );
    defer config.deinit();

    try config.set_redirect_uri("http://localhost:9999/callback");
    // try config.setScope("read write");

    const pkce = try PKCE.init(init.io, init.arena);
    defer pkce.deinit();
    std.debug.print(
        "PKCE:\nverifier: {s}\nchallenge: {s}\n",
        .{ pkce.code_verifier, pkce.code_challenge },
    );

    var client = OAuth2Client.init(init.arena, config);

    // Step 1: Build authorization URL
    var state_buf: [32]u8 = undefined;
    std.Io.random(init.io, &state_buf);
    const state = std.fmt.bytesToHex(state_buf, .lower);

    const auth_url = try client.buildAuthorizationUrl(&state, &pkce);
    defer init.arena.free(auth_url);

    // Print the authorization URL to stdout so it appears in the debugger's
    // program-output stream rather than only in LLDB diagnostics.
    var stdout_buffer: [1024]u8 = undefined;
    var stdout_file_writer: std.Io.File.Writer = .init(.stdout(), init.io, &stdout_buffer);
    const stdout_writer = &stdout_file_writer.interface;
    try stdout_writer.print("{s}\n", .{auth_url});
    try stdout_writer.flush();

    // Wait for callback
    var code_buffer: [1 * KiB]u8 = undefined;
    var code: []u8 = &code_buffer;
    try auth_callback_server.listen(init.io, 9999, &code, &state);
    std.debug.print("code returned={s}", .{code});

    // Step 2: After callback, exchange code for token
    var token = try client.exchangeAuthorizationCode(code, &pkce, init.io);
    defer token.deinit();

    // // Step 3: Use token for API requests
    const auth_header = try token.getAuthorizationHeader();
    std.debug.print("Auth Header:{s}\n", .{auth_header});
    // defer allocator.free(auth_header);
    // // Authorization: Bearer access_token_12345

    // Generate
}
