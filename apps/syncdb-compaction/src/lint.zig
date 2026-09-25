//! Source lint rules for Zig, ported from apps/syncdb-server/test/test_lint.ml.
//! Uses `std.zig.Ast` to inspect declarations without compiling them.

const std = @import("std");
const Ast = std.zig.Ast;
const Allocator = std.mem.Allocator;
const Io = std.Io;
const assert = std.debug.assert;

pub const max_function_lines: u32 = 70;
pub const min_assertions_per_function: u32 = 2;

pub const LintError = struct {
    message: []const u8,
    filename: []const u8,
    start_line: u32,
    end_line: u32,

    pub fn deinit(self: LintError, gpa: Allocator) void {
        gpa.free(self.message);
        gpa.free(self.filename);
    }
};

const ForbiddenName = struct {
    name: []const u8,
    suggestion: []const u8,
};

const forbidden_names = [_]ForbiddenName{
    .{ .name = "arg", .suggestion = "argument" },
    .{ .name = "args", .suggestion = "arguments" },
    .{ .name = "buf", .suggestion = "buffer" },
    .{ .name = "cfg", .suggestion = "configuration" },
    .{ .name = "dest", .suggestion = "destination" },
    .{ .name = "dst", .suggestion = "destination" },
    .{ .name = "err", .suggestion = "error" },
    .{ .name = "errs", .suggestion = "errors" },
    .{ .name = "fn", .suggestion = "function" },
    .{ .name = "fmt", .suggestion = "format" },
    .{ .name = "idx", .suggestion = "index" },
    .{ .name = "len", .suggestion = "length" },
    .{ .name = "msg", .suggestion = "message" },
    .{ .name = "num", .suggestion = "number" },
    .{ .name = "obj", .suggestion = "object" },
    .{ .name = "op", .suggestion = "operation" },
    .{ .name = "param", .suggestion = "parameter" },
    .{ .name = "params", .suggestion = "parameters" },
    .{ .name = "pos", .suggestion = "position" },
    .{ .name = "prev", .suggestion = "previous" },
    .{ .name = "ptr", .suggestion = "pointer" },
    .{ .name = "ref", .suggestion = "reference" },
    .{ .name = "req", .suggestion = "request" },
    .{ .name = "resp", .suggestion = "response" },
    .{ .name = "src", .suggestion = "source" },
    .{ .name = "tmp", .suggestion = "temporary" },
    .{ .name = "val", .suggestion = "value" },
};

/// Returns the preferred full name when `name` is a banned abbreviation.
pub fn suggestionForName(name: []const u8) ?[]const u8 {
    assert(name.len > 0);
    var lower_buffer: [128]u8 = undefined;
    if (name.len > lower_buffer.len) return null;
    const lower = std.ascii.lowerString(lower_buffer[0..name.len], name);
    assert(lower.len == name.len);
    for (forbidden_names) |entry| {
        if (std.mem.eql(u8, lower, entry.name)) return entry.suggestion;
    }
    return null;
}

fn formatNameError(gpa: Allocator, name: []const u8, suggestion: []const u8) ![]u8 {
    assert(name.len > 0);
    assert(suggestion.len > 0);
    // Preserve the OCaml wording for these two special cases.
    if (std.ascii.eqlIgnoreCase(name, "err")) {
        return try gpa.dupe(u8, "err abbriviation is not allowed use full names like: \"error\"");
    }
    if (std.ascii.eqlIgnoreCase(name, "ptr")) {
        return try gpa.dupe(u8, "ptr abbriviation is not allowed use full names like: \"pointer\"");
    }
    return try std.fmt.allocPrint(
        gpa,
        "\"{s}\" abbriviation is not allowed use full names like: \"{s}\"",
        .{ name, suggestion },
    );
}

fn nodeLineSpan(tree: Ast, node: Ast.Node.Index) struct { start_line: u32, end_line: u32, line_count: u32 } {
    const start = tree.tokenLocation(0, tree.firstToken(node));
    const end = tree.tokenLocation(0, tree.lastToken(node));
    assert(end.line >= start.line);
    const line_count: u32 = @intCast(end.line - start.line + 1);
    assert(line_count >= 1);
    return .{
        .start_line = @intCast(start.line + 1),
        .end_line = @intCast(end.line + 1),
        .line_count = line_count,
    };
}

fn appendError(
    gpa: Allocator,
    errors: *std.ArrayList(LintError),
    filename: []const u8,
    start_line: u32,
    end_line: u32,
    message: []u8,
) !void {
    assert(message.len > 0);
    assert(filename.len > 0);
    const owned_filename = try gpa.dupe(u8, filename);
    errdefer gpa.free(owned_filename);
    try errors.append(gpa, .{
        .message = message,
        .filename = owned_filename,
        .start_line = start_line,
        .end_line = end_line,
    });
}

fn checkName(
    gpa: Allocator,
    errors: *std.ArrayList(LintError),
    filename: []const u8,
    name: []const u8,
    start_line: u32,
    end_line: u32,
) !void {
    assert(name.len > 0);
    const suggestion = suggestionForName(name) orelse return;
    const message = try formatNameError(gpa, name, suggestion);
    errdefer gpa.free(message);
    try appendError(gpa, errors, filename, start_line, end_line, message);
}

fn calleeIsAssert(tree: Ast, node: Ast.Node.Index) bool {
    var current = node;
    while (true) {
        switch (tree.nodeTag(current)) {
            .identifier => {
                const is_assert = std.mem.eql(u8, tree.tokenSlice(tree.nodeMainToken(current)), "assert");
                assert(tree.tokenTag(tree.nodeMainToken(current)) == .identifier);
                return is_assert;
            },
            .field_access => {
                const field_token = tree.nodeData(current).node_and_token[1];
                assert(tree.tokenTag(field_token) == .identifier);
                return std.mem.eql(u8, tree.tokenSlice(field_token), "assert");
            },
            .grouped_expression => {
                current = tree.nodeData(current).node_and_token[0];
            },
            else => return false,
        }
    }
}

fn countAssertionsInNode(tree: Ast, root: Ast.Node.Index) u32 {
    const first_token = tree.firstToken(root);
    const last_token = tree.lastToken(root);
    assert(last_token >= first_token);

    var count: u32 = 0;
    var index: u32 = 0;
    while (index < tree.nodes.len) : (index += 1) {
        const node: Ast.Node.Index = @enumFromInt(index);
        const main_token = tree.nodeMainToken(node);
        if (main_token < first_token or main_token > last_token) continue;

        switch (tree.nodeTag(node)) {
            .builtin_call,
            .builtin_call_comma,
            .builtin_call_two,
            .builtin_call_two_comma,
            => {
                if (std.mem.eql(u8, tree.tokenSlice(main_token), "@assert")) {
                    count += 1;
                }
            },
            .call,
            .call_comma,
            .call_one,
            .call_one_comma,
            => {
                const callee: Ast.Node.Index = switch (tree.nodeTag(node)) {
                    .call, .call_comma => tree.nodeData(node).node_and_extra[0],
                    .call_one, .call_one_comma => tree.nodeData(node).node_and_opt_node[0],
                    else => unreachable,
                };
                if (calleeIsAssert(tree, callee)) count += 1;
            },
            else => {},
        }
    }
    return count;
}

fn varDeclNameToken(tree: Ast, node: Ast.Node.Index) ?Ast.TokenIndex {
    const full = tree.fullVarDecl(node) orelse return null;
    const name_token = full.ast.mut_token + 1;
    if (name_token >= tree.tokens.len) return null;
    if (tree.tokenTag(name_token) != .identifier) return null;
    return name_token;
}

fn nodeContainsIdentifier(tree: Ast, node: Ast.Node.Index, identifier: []const u8) bool {
    assert(identifier.len > 0);
    const first_token = tree.firstToken(node);
    const last_token = tree.lastToken(node);
    assert(last_token >= first_token);

    var token = first_token;
    while (token <= last_token) : (token += 1) {
        if (tree.tokenTag(token) != .identifier) continue;
        if (std.mem.eql(u8, tree.tokenSlice(token), identifier)) return true;
    }
    return false;
}

fn fnProtoHasParameterTypeIdentifier(tree: Ast, fn_proto: *const Ast.full.FnProto, identifier: []const u8) bool {
    assert(identifier.len > 0);
    var param_iterator = fn_proto.iterate(&tree);
    while (param_iterator.next()) |parameter| {
        const type_node = parameter.type_expr orelse continue;
        if (nodeContainsIdentifier(tree, type_node, identifier)) return true;
    }
    return false;
}

fn functionSkipsAssertionFloor(tree: Ast, fn_proto: *const Ast.full.FnProto, function_name: []const u8) bool {
    assert(function_name.len > 0);
    if (std.mem.eql(u8, function_name, "main")) return true;
    if (fnProtoHasParameterTypeIdentifier(tree, fn_proto, "Smith")) return true;
    return false;
}

fn checkFunction(
    gpa: Allocator,
    tree: Ast,
    errors: *std.ArrayList(LintError),
    filename: []const u8,
    node: Ast.Node.Index,
) !void {
    assert(tree.nodeTag(node) == .fn_decl);
    const proto_node, const body_node = tree.nodeData(node).node_and_node;

    var proto_buffer: [1]Ast.Node.Index = undefined;
    const fn_proto = tree.fullFnProto(&proto_buffer, proto_node).?;

    const span = nodeLineSpan(tree, body_node);
    const function_name: ?[]const u8 = if (fn_proto.name_token) |token|
        tree.tokenSlice(token)
    else
        null;

    if (function_name) |name| {
        try checkName(gpa, errors, filename, name, span.start_line, span.end_line);
    }

    if (span.line_count > max_function_lines) {
        const message = if (function_name) |name|
            try std.fmt.allocPrint(
                gpa,
                "function \"{s}\" is too long ({d} lines). Maximum is {d} lines.",
                .{ name, span.line_count, max_function_lines },
            )
        else
            try std.fmt.allocPrint(
                gpa,
                "function is too long ({d} lines). Maximum is {d} lines.",
                .{ span.line_count, max_function_lines },
            );
        errdefer gpa.free(message);
        try appendError(gpa, errors, filename, span.start_line, span.end_line, message);
    }

    // Match the OCaml port: only named functions need the assertion floor.
    if (function_name) |name| {
        if (!functionSkipsAssertionFloor(tree, &fn_proto, name)) {
            const assertion_count = countAssertionsInNode(tree, body_node);
            if (assertion_count < min_assertions_per_function) {
                const message = try std.fmt.allocPrint(
                    gpa,
                    "function \"{s}\" has {d} assertions. Minimum is {d} assertions.",
                    .{ name, assertion_count, min_assertions_per_function },
                );
                errdefer gpa.free(message);
                try appendError(gpa, errors, filename, span.start_line, span.end_line, message);
            }
        }
    }

    var param_iterator = fn_proto.iterate(&tree);
    while (param_iterator.next()) |parameter| {
        const name_token = parameter.name_token orelse continue;
        const name = tree.tokenSlice(name_token);
        const location = tree.tokenLocation(0, name_token);
        const line: u32 = @intCast(location.line + 1);
        try checkName(gpa, errors, filename, name, line, line);
    }
}

fn checkVarDecl(
    gpa: Allocator,
    tree: Ast,
    errors: *std.ArrayList(LintError),
    filename: []const u8,
    node: Ast.Node.Index,
) !void {
    const name_token = varDeclNameToken(tree, node) orelse return;
    const name = tree.tokenSlice(name_token);
    const span = nodeLineSpan(tree, node);
    try checkName(gpa, errors, filename, name, span.start_line, span.end_line);
}

fn checkContainerField(
    gpa: Allocator,
    tree: Ast,
    errors: *std.ArrayList(LintError),
    filename: []const u8,
    node: Ast.Node.Index,
) !void {
    const field = tree.fullContainerField(node) orelse return;
    if (field.ast.tuple_like) return;
    const name_token = field.ast.main_token;
    if (tree.tokenTag(name_token) != .identifier) return;
    const name = tree.tokenSlice(name_token);
    const span = nodeLineSpan(tree, node);
    try checkName(gpa, errors, filename, name, span.start_line, span.end_line);
}

/// Lint a full Zig source buffer. Parse errors are reported as lint errors.
pub fn lintSource(
    gpa: Allocator,
    filename: []const u8,
    source: [:0]const u8,
    errors: *std.ArrayList(LintError),
) !void {
    assert(filename.len > 0);

    var tree = try Ast.parse(gpa, source, .zig);
    defer tree.deinit(gpa);

    if (tree.errors.len > 0) {
        const message = try std.fmt.allocPrint(
            gpa,
            "failed to parse Zig source ({d} parse error(s))",
            .{tree.errors.len},
        );
        errdefer gpa.free(message);
        try appendError(gpa, errors, filename, 1, 1, message);
        return;
    }

    var index: u32 = 0;
    while (index < tree.nodes.len) : (index += 1) {
        const node: Ast.Node.Index = @enumFromInt(index);
        switch (tree.nodeTag(node)) {
            .fn_decl => try checkFunction(gpa, tree, errors, filename, node),
            .global_var_decl,
            .local_var_decl,
            .simple_var_decl,
            .aligned_var_decl,
            => try checkVarDecl(gpa, tree, errors, filename, node),
            .container_field,
            .container_field_init,
            .container_field_align,
            => try checkContainerField(gpa, tree, errors, filename, node),
            else => {},
        }
    }
}

pub fn lintFile(gpa: Allocator, io: Io, path: []const u8, errors: *std.ArrayList(LintError)) !void {
    assert(path.len > 0);
    const source = try Io.Dir.cwd().readFileAllocOptions(
        io,
        path,
        gpa,
        .limited(16 * 1024 * 1024),
        .of(u8),
        0,
    );
    defer gpa.free(source);
    try lintSource(gpa, path, source, errors);
}

pub fn freeErrors(gpa: Allocator, errors: *std.ArrayList(LintError)) void {
    for (errors.items) |item| item.deinit(gpa);
    errors.deinit(gpa);
}

fn expectMessageContains(errors: []const LintError, needle: []const u8) !void {
    assert(needle.len > 0);
    for (errors) |item| {
        if (std.mem.indexOf(u8, item.message, needle) != null) return;
    }
    std.debug.print("expected a lint message containing: {s}\n", .{needle});
    for (errors) |item| {
        std.debug.print("  - {s}\n", .{item.message});
    }
    return error.TestExpectedEqual;
}

test "name validator rejects banned abbreviations" {
    try std.testing.expect(suggestionForName("buf") != null);
    try std.testing.expect(suggestionForName("buffer") == null);
    try std.testing.expect(suggestionForName("IDX") != null);
    try std.testing.expect(suggestionForName("length") == null);
}

test "lint reports short functions without enough assertions" {
    const source =
        \\pub fn add(left: i32, right: i32) i32 {
        \\    return left + right;
        \\}
    ;
    var errors: std.ArrayList(LintError) = .empty;
    defer freeErrors(std.testing.allocator, &errors);

    try lintSource(std.testing.allocator, "synthetic.zig", source, &errors);
    try std.testing.expect(errors.items.len >= 1);
    try expectMessageContains(errors.items, "has 0 assertions");
}

test "lint accepts functions that meet the assertion floor" {
    const source =
        \\const std = @import("std");
        \\pub fn add(left: i32, right: i32) i32 {
        \\    std.debug.assert(true);
        \\    std.debug.assert(left != right or left == right);
        \\    return left + right;
        \\}
    ;
    var errors: std.ArrayList(LintError) = .empty;
    defer freeErrors(std.testing.allocator, &errors);

    try lintSource(std.testing.allocator, "synthetic.zig", source, &errors);
    try std.testing.expectEqual(@as(usize, 0), errors.items.len);
}

test "lint skips assertion floor for test declarations" {
    const source =
        \\const std = @import("std");
        \\test "basic add functionality" {
        \\    try std.testing.expect(true);
        \\}
    ;
    var errors: std.ArrayList(LintError) = .empty;
    defer freeErrors(std.testing.allocator, &errors);

    try lintSource(std.testing.allocator, "synthetic.zig", source, &errors);
    try std.testing.expectEqual(@as(usize, 0), errors.items.len);
}

test "lint reports banned parameter names" {
    const source =
        \\const std = @import("std");
        \\pub fn use(buf: []u8) void {
        \\    std.debug.assert(buf.len >= 0);
        \\    std.debug.assert(true);
        \\    _ = buf;
        \\}
    ;
    var errors: std.ArrayList(LintError) = .empty;
    defer freeErrors(std.testing.allocator, &errors);

    try lintSource(std.testing.allocator, "synthetic.zig", source, &errors);
    try expectMessageContains(errors.items, "\"buf\" abbriviation");
}

test "lint ignores stdlib len field access" {
    const source =
        \\const std = @import("std");
        \\pub fn count(items: []const u8) u32 {
        \\    std.debug.assert(items.len > 0);
        \\    std.debug.assert(items.len >= 1);
        \\    return @as(u32, items.len);
        \\}
    ;
    var errors: std.ArrayList(LintError) = .empty;
    defer freeErrors(std.testing.allocator, &errors);

    try lintSource(std.testing.allocator, "synthetic.zig", source, &errors);
    try std.testing.expectEqual(@as(usize, 0), errors.items.len);
}

test "lint skips assertion floor for Zig entry points" {
    const source =
        \\const std = @import("std");
        \\pub fn main(init: std.process.Init) !void {
        \\    _ = init;
        \\}
    ;
    var errors: std.ArrayList(LintError) = .empty;
    defer freeErrors(std.testing.allocator, &errors);

    try lintSource(std.testing.allocator, "synthetic.zig", source, &errors);
    try std.testing.expectEqual(@as(usize, 0), errors.items.len);
}

test "lint skips assertion floor for fuzz callbacks" {
    const source =
        \\const std = @import("std");
        \\fn checkFuzzCase(context: void, smith: *std.testing.Smith) !void {
        \\    _ = context;
        \\    _ = smith;
        \\}
    ;
    var errors: std.ArrayList(LintError) = .empty;
    defer freeErrors(std.testing.allocator, &errors);

    try lintSource(std.testing.allocator, "synthetic.zig", source, &errors);
    try std.testing.expectEqual(@as(usize, 0), errors.items.len);
}

test "lint reports functions that exceed the line limit" {
    var source_list: std.ArrayList(u8) = .empty;
    defer source_list.deinit(std.testing.allocator);

    try source_list.appendSlice(std.testing.allocator, "const std = @import(\"std\");\n");
    try source_list.appendSlice(std.testing.allocator, "pub fn longFunction() void {\n");
    try source_list.appendSlice(std.testing.allocator, "    std.debug.assert(true);\n");
    try source_list.appendSlice(std.testing.allocator, "    std.debug.assert(true);\n");
    var line_index: u32 = 0;
    while (line_index < max_function_lines) : (line_index += 1) {
        try source_list.appendSlice(std.testing.allocator, "    _ = 1;\n");
    }
    try source_list.appendSlice(std.testing.allocator, "}\n");
    try source_list.append(std.testing.allocator, 0);

    var errors: std.ArrayList(LintError) = .empty;
    defer freeErrors(std.testing.allocator, &errors);

    try lintSource(
        std.testing.allocator,
        "synthetic.zig",
        source_list.items[0 .. source_list.items.len - 1 :0],
        &errors,
    );
    try expectMessageContains(errors.items, "is too long");
}

test "lint project sources" {
    const io = std.testing.io;
    var src_dir = Io.Dir.cwd().openDir(io, "src", .{ .iterate = true }) catch |err| {
        // Allow running the synthetic unit tests above from a scratch cwd.
        if (err == error.FileNotFound) return;
        return err;
    };
    defer src_dir.close(io);

    const gpa = std.testing.allocator;
    var errors: std.ArrayList(LintError) = .empty;
    defer freeErrors(gpa, &errors);

    var iterator = src_dir.iterate();
    while (try iterator.next(io)) |entry| {
        if (entry.kind != .file) continue;
        if (!std.mem.endsWith(u8, entry.name, ".zig")) continue;
        if (std.mem.eql(u8, entry.name, "lint.zig")) continue;

        const path = try std.fmt.allocPrint(gpa, "src/{s}", .{entry.name});
        defer gpa.free(path);
        try lintFile(gpa, io, path, &errors);
    }

    if (errors.items.len > 0) {
        for (errors.items) |item| {
            std.debug.print(
                "\nerror: {s}\n  file: {s}\n  start_line: {d}\n  end_line: {d}\n",
                .{ item.message, item.filename, item.start_line, item.end_line },
            );
        }
        return error.LintFailed;
    }
}
