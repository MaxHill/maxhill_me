const std = @import("std");
const sync_simulator = @import("sync_simulator");
const FRNG = sync_simulator.FRNG;

fn run_test(gpa: std.Allocator, frng: *FRNG) !void {
    var world = World.init(gpa, &frng) catch |err|
        switch (err) {
            error.OutOfEntropy => return,
            else => return err,
        };
    defer World.deinit(gpa);

    while (true) {
        world.step() catch |err| switch (err) {
            error.OutOfEntropy => break,
        };
    }
}

const World = struct {
    frng: *FRNG,
    replicas: []type,
    weights: ActionWeights,

    const ActionWeights = struct {
        request: u32,
        message: u32,
        crash: u32,
    };

    pub fn init(gpa: std.Allocator, frng: *FRNG) !void {
        const weights = try frng.swarm_weights(ActionWeights);
        //...
    }

    pub fn simulate_request(world: *World) !void {
        const replica = try world.frng.index(world.replicas);
        const payload = try world.frng.int(u64);

        world.send_payload(replica, payload);
    }

    pub fn send_payload(replica: type, payload: u64) void {
        std.debug.print("Replica: {}, payload: {}\n", .{ replica, payload });
    }

    pub fn step(world: *World) !void {
        const action = try world.frng.weighted(.{
            .request = 10,
            .message = 20,
            .crash = 1,
        });
        switch (action) {
            .request => try world.simulate_request(),
            .message => {
                std.debug.print("Sample message");
            },
            .crash => {
                std.debug.print("CRASH!");
            },
        }
    }
};

pub fn main(init: std.process.Init) !void {
    const gpa = init.gpa;
    const io = init.io;

    var stdin_reader = std.IO.File.stdin().reader(io, &.{});
    const entropy = try stdin_reader.interface.allocRemaining(gpa, .unlimited);
    defer gpa.free(entropy);

    var frng = FRNG.init(entropy);

    var world = World.init(gpa, &frng, .{}) catch |err|
        switch (err) {
            error.OutOfEntropy => return,
            else => return err,
        };
    defer world.deinit(gpa);

    world.run();
}
