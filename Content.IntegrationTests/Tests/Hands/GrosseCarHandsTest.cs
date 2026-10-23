using System.Linq;
using Content.IntegrationTests.Fixtures;
using Content.Shared._Grosse.Cars;
using Content.Shared.Hands.EntitySystems;
using Content.Shared.Interaction.Components;
using Content.Shared.Inventory.VirtualItem;
using Robust.Shared.Containers;
using Robust.Shared.GameObjects;

namespace Content.IntegrationTests.Tests.Hands;

[TestFixture]
public sealed class GrosseCarHandsTest : GameTest
{
    [TestCase("VehicleMoskvich17", "driver")]
    [TestCase("VehicleMoskvich17", "passenger")]
    [TestCase("VehicleZIL17", "driver")]
    [TestCase("VehicleZIL17", "passenger")]
    [TestCase("VehicleZIL17", "passenger2")]
    [TestCase("VehicleKraz17", "driver")]
    [TestCase("VehicleKraz17", "passenger")]
    [TestCase("VehicleKraz17", "passenger2")]
    public async Task OccupantCannotRemoveHandBlockers(string prototype, string slot)
    {
        var map = await Pair.CreateTestMap();
        var em = Server.EntMan;
        var cars = Server.System<SharedGrosseCarSystem>();
        var hands = Server.System<SharedHandsSystem>();
        var containers = Server.System<SharedContainerSystem>();
        EntityUid car = default;
        EntityUid occupant = default;
        EntityUid item = default;
        EntityUid[] blockers = Array.Empty<EntityUid>();

        await Server.WaitAssertion(() =>
        {
            car = em.SpawnEntity(prototype, map.GridCoords);
            occupant = em.SpawnEntity("MobHuman", map.GridCoords);
            item = em.SpawnEntity("Crowbar", map.GridCoords);
            Assert.That(hands.TryPickupAnyHand(occupant, item), Is.True);
            var carEntity = (car, em.GetComponent<GrosseCarComponent>(car));
            Assert.That(cars.TryInsert(carEntity, occupant, slot), Is.True);
            Assert.That(hands.CountFreeHands(occupant), Is.Zero);
            blockers = hands.EnumerateHeld(occupant).ToArray();
            Assert.That(blockers, Has.Length.EqualTo(hands.EnumerateHands(occupant).Count()));
            var destination = containers.EnsureContainer<Container>(occupant, "test-car-hands");
            foreach (var blocker in blockers)
            {
                Assert.That(em.HasComponent<VirtualItemComponent>(blocker), Is.True);
                Assert.That(em.HasComponent<UnremoveableComponent>(blocker), Is.True);
                Assert.That(hands.TryDrop(occupant, blocker), Is.False);
                Assert.That(hands.TryDrop(occupant, blocker, checkActionBlocker: false), Is.False);
                Assert.That(hands.TryDropIntoContainer(occupant, blocker, destination, checkActionBlocker: false), Is.False);
            }
            Assert.That(hands.TryPickupAnyHand(occupant, item), Is.False);
            Assert.That(cars.TryEject(carEntity, occupant, occupant, skipDelay: true), Is.True);
        });

        await Pair.RunTicksSync(5);
        await Server.WaitAssertion(() =>
        {
            Assert.That(em.HasComponent<GrosseCarRiderComponent>(occupant), Is.False);
            foreach (var blocker in blockers)
                Assert.That(em.Deleted(blocker), Is.True);
            Assert.That(hands.CountFreeHands(occupant), Is.EqualTo(hands.EnumerateHands(occupant).Count()));
            Assert.That(hands.TryPickupAnyHand(occupant, item), Is.True);
            em.DeleteEntity(occupant);
            em.DeleteEntity(car);
            if (!em.Deleted(item))
                em.DeleteEntity(item);
        });
    }
}
