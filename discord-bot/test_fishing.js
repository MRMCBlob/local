import { FishingRNG } from './src/systems/fishing_rng.js';

console.log('🎣 Testing Fishing RNG System\n');

// Test 1: Basic probability calculation
console.log('=== Test 1: Basic Probability Calculation ===');
const basicProbs = FishingRNG.calculateProbabilities('wooden', 'cloudy', false);
const totalChance = basicProbs.reduce((sum, fish) => sum + fish.normalized_chance, 0);
console.log(`Total probability: ${totalChance.toFixed(2)}% (should be 100%)`);
console.log(`Number of fish: ${basicProbs.length}`);
console.log(`Minimum chance: ${Math.min(...basicProbs.map(f => f.normalized_chance)).toFixed(2)}%`);
console.log();

// Test 2: Rod modifier effects
console.log('=== Test 2: Rod Modifier Effects ===');
const rodTypes = ['wooden', 'iron', 'gold', 'diamond'];
rodTypes.forEach(rod => {
    const probs = FishingRNG.calculateProbabilities(rod, 'cloudy', false);
    const mythicChance = probs.find(f => f.rarity === 'mythic')?.normalized_chance || 0;
    console.log(`${rod} rod - Mythic chance: ${mythicChance.toFixed(3)}%`);
});
console.log();

// Test 3: Weather modifier effects
console.log('=== Test 3: Weather Modifier Effects ===');
const weatherTypes = ['sunny', 'cloudy', 'rainy', 'stormy', 'foggy'];
weatherTypes.forEach(weather => {
    const probs = FishingRNG.calculateProbabilities('wooden', weather, false);
    const legendaryChance = probs.find(f => f.rarity === 'legendary')?.normalized_chance || 0;
    console.log(`${weather} weather - Legendary chance: ${legendaryChance.toFixed(3)}%`);
});
console.log();

// Test 4: Luck potion effects
console.log('=== Test 4: Luck Potion Effects ===');
const withoutLuck = FishingRNG.calculateProbabilities('gold', 'rainy', false);
const withLuck = FishingRNG.calculateProbabilities('gold', 'rainy', true);
console.log('Gold rod + Rainy weather:');
console.log(`Without luck potion - Mythic: ${withoutLuck.find(f => f.rarity === 'mythic')?.normalized_chance.toFixed(3)}%`);
console.log(`With luck potion - Mythic: ${withLuck.find(f => f.rarity === 'mythic')?.normalized_chance.toFixed(3)}%`);
console.log();

// Test 5: Simulation of 1000 fishing attempts
console.log('=== Test 5: Simulation Results (1000 attempts) ===');
const rarityCount = { common: 0, uncommon: 0, rare: 0, legendary: 0, mythic: 0 };
const totalValue = { total: 0 };

for (let i = 0; i < 1000; i++) {
    const fish = FishingRNG.catchFish('diamond', 'stormy', true); // Best conditions
    if (fish) {
        rarityCount[fish.rarity]++;
        totalValue.total += fish.value;
    }
}

console.log('Rarity distribution (best conditions):');
Object.entries(rarityCount).forEach(([rarity, count]) => {
    console.log(`${rarity}: ${count} (${(count/10).toFixed(1)}%)`);
});
console.log(`Average value per fish: ${(totalValue.total / 1000).toFixed(1)} coins`);
console.log();

// Test 6: Inventory system
console.log('=== Test 6: Inventory System ===');
const testUserId = 'test_user_123';

// Add some test fish
for (let i = 0; i < 5; i++) {
    const fish = FishingRNG.catchFish('wooden', 'cloudy', false);
    FishingRNG.addFishToInventory(testUserId, fish);
}

const inventory = FishingRNG.getUserInventory(testUserId);
console.log(`Fish in inventory: ${inventory.fish.length}`);
console.log(`Total value: ${inventory.total_value} coins`);

const summary = FishingRNG.getInventorySummary(testUserId);
console.log(`Inventory empty: ${summary.isEmpty}`);
console.log(`Total fish: ${summary.totalFish}`);
console.log(`Rarity groups: ${Object.keys(summary.rarityGroups || {}).join(', ')}`);

// Test selling
const saleResult = FishingRNG.sellAllFish(testUserId);
console.log(`Sale successful: ${saleResult.success}`);
console.log(`Fish sold: ${saleResult.fish_count}`);
console.log(`Total earned: ${saleResult.total_value} coins`);

// Check inventory is empty
const emptyInventory = FishingRNG.getUserInventory(testUserId);
console.log(`Inventory after sale: ${emptyInventory.fish.length} fish`);
console.log();

// Test 7: Cooldown system
console.log('=== Test 7: Cooldown System ===');
const testUserId2 = 'test_user_456';

const beforeCooldown = FishingRNG.checkFishingCooldown(testUserId2);
console.log(`On cooldown before fishing: ${beforeCooldown.onCooldown}`);

FishingRNG.setFishingCooldown(testUserId2);
const afterCooldown = FishingRNG.checkFishingCooldown(testUserId2);
console.log(`On cooldown after fishing: ${afterCooldown.onCooldown}`);
console.log(`Time remaining: ${afterCooldown.timeRemainingSeconds} seconds`);
console.log();

// Test 8: Debug probabilities
console.log('=== Test 8: Debug Probability Display ===');
const debugInfo = FishingRNG.debugProbabilities('diamond', 'stormy', true);
console.log('Diamond rod + Stormy weather + Luck potion:');
debugInfo.slice(0, 5).forEach(fish => {
    console.log(`${fish.name}: ${fish.base_chance} → ${fish.final_chance} (${fish.rarity})`);
});
console.log();

console.log('✅ All tests completed successfully!');
console.log('🎣 Fishing system is ready to use!');