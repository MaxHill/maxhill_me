const std = @import("std");
const httpz = @import("httpz");

const Response = struct {
    status: u16,
    body: []const u8,
};

const RequestState = struct {
    id: i64,
    response: ?*const Response,

    pub fn done(self: *RequestState, resp: *const Response) void {
        self.response = resp;
    }

    pub fn isDone(self: *const RequestState) bool {
        return self.response != null;
    }
};

const HandlerFn = *const fn (*RequestState) void;

const NewRequestEvent = struct {
    request_id: i64,
    handler: HandlerFn,
    response_ptr: *std.atomic.Value(?*const Response),
};

fn Queue(comptime T: type) type {
    return struct {
        const Self = @This();

        buf: []T,
        head: usize,
        tail: usize,
        size: usize,
        capacity: usize,

        pub fn init(allocator: std.mem.Allocator, cap: usize) !Self {
            const buf = try allocator.alloc(T, cap);
            return Self{
                .buf = buf,
                .head = 0,
                .tail = 0,
                .size = 0,
                .capacity = cap,
            };
        }

        pub fn deinit(self: *Self, allocator: std.mem.Allocator) void {
            allocator.free(self.buf);
        }

        pub fn enqueue(self: *Self, item: T) bool {
            if (self.size == self.capacity) {
                return false;
            }
            self.buf[self.tail] = item;
            self.tail = (self.tail + 1) % self.capacity;
            self.size += 1;
            return true;
        }

        pub fn dequeue(self: *Self) ?T {
            if (self.size == 0) {
                return null;
            }
            const item = self.buf[self.head];
            self.head = (self.head + 1) % self.capacity;
            self.size -= 1;
            return item;
        }
    };
}

const Core = struct {
    current_tick: i64,
    request_queue: Queue(NewRequestEvent),
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) !Core {
        return Core{
            .current_tick = 0,
            .request_queue = try Queue(NewRequestEvent).init(allocator, 10000),
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Core) void {
        self.request_queue.deinit(self.allocator);
    }

    pub fn requestQueueSize(self: *const Core) usize {
        return self.request_queue.size;
    }

    pub fn requestQueueCapacity(self: *const Core) usize {
        return self.request_queue.capacity;
    }

    pub fn enqueue(self: *Core, request: NewRequestEvent) bool {
        return self.request_queue.enqueue(request);
    }

    pub fn tick(self: *Core) bool {
        const maybe_request = self.request_queue.dequeue();
        if (maybe_request == null) {
            return false;
        }

        const request = maybe_request.?;
        var state = RequestState{
            .id = request.request_id,
            .response = null,
        };

        request.handler(&state);

        if (state.isDone()) {
            request.response_ptr.store(state.response.?, .release);
        }

        return true;
    }
};

var core: Core = undefined;
var request_id_counter: std.atomic.Value(i64) = std.atomic.Value(i64).init(0);

fn requestHandler(state: *RequestState) void {
    const body = std.fmt.allocPrint(std.heap.page_allocator, "Processed request {d}\n", .{state.id}) catch "Error";

    const resp = std.heap.page_allocator.create(Response) catch unreachable;
    resp.* = Response{
        .status = 200,
        .body = body,
    };
    state.done(resp);
}

fn coreHandler(req: *httpz.Request, res: *httpz.Response) !void {
    _ = req;

    const queue_size = core.requestQueueSize();
    const queue_cap = core.requestQueueCapacity();

    if (queue_size > @as(usize, @intFromFloat(@as(f64, @floatFromInt(queue_cap)) * 0.95))) {
        res.status = 503;
        res.body = "Server overloaded";
        return;
    }

    var response_atomic = std.atomic.Value(?*const Response).init(null);

    const request_id = request_id_counter.fetchAdd(1, .monotonic);
    const event = NewRequestEvent{
        .request_id = request_id,
        .handler = requestHandler,
        .response_ptr = &response_atomic,
    };

    if (!core.enqueue(event)) {
        res.status = 503;
        res.body = "Queue full";
        return;
    }

    const timeout_ns = 5 * std.time.ns_per_s;
    const start = std.time.nanoTimestamp();

    while (true) {
        if (response_atomic.load(.acquire)) |response| {
            res.status = response.status;
            res.body = response.body;
            return;
        }

        const elapsed = std.time.nanoTimestamp() - start;
        if (elapsed > timeout_ns) {
            res.status = 504;
            res.body = "Request timeout";
            return;
        }

        std.Thread.sleep(100 * std.time.ns_per_us);
    }
}

fn directHandler(_: *httpz.Request, res: *httpz.Response) !void {
    res.status = 200;
    res.body = "Processed directly\n";
}

fn processingLoop() void {
    while (true) {
        _ = core.tick();
    }
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    core = try Core.init(allocator);
    defer core.deinit();

    const thread = try std.Thread.spawn(.{}, processingLoop, .{});
    thread.detach();

    var server = try httpz.Server(void).init(allocator, .{
        .port = 8080,
        .address = "127.0.0.1",
    }, {});
    defer server.deinit();

    var router = try server.router(.{});
    router.all("/", coreHandler, .{});
    router.all("/direct", directHandler, .{});

    std.debug.print("Zig HTTP server running on :8080\n", .{});
    std.debug.print("Endpoints:\n", .{});
    std.debug.print("  /        - Requests routed through Core\n", .{});
    std.debug.print("  /direct  - Direct handler (no Core)\n", .{});

    try server.listen();
}
