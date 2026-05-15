import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

// Recipe data extracted from MASTER RECIPE.xlsx
const CRAFT_COCKTAILS = [
  {
    name: "PINS & NEEDLES",
    portionCount: 15,
    dilutionPct: 0,
    glassType: "Rock Glass",
    iceType: "Big Clear Ice Cube",
    garnish: "Buzz Button",
    pourFromBatch: "4oz",
    howTo: "Pour 4oz batch in shaker, shake well.",
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Haku Vodka", amount: 2, unit: "OZ" },
      { name: "St George Spiced Pear Liq", amount: 0.75, unit: "OZ" },
      { name: "Lime Juice", amount: 0.5, unit: "OZ" },
      { name: "Sage Tea Syrup", amount: 0.5, unit: "OZ" },
      { name: "Simple Syrup", amount: 0.25, unit: "OZ" },
    ],
  },
  {
    name: "ISLAND CHAI",
    portionCount: 20,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Sazerac 100 Proof RYE", amount: 2, unit: "OZ" },
      { name: "St George Spiced Pear Liq", amount: 0.5, unit: "OZ" },
      { name: "Chambord", amount: 0.5, unit: "OZ" },
      { name: "Sage Tea Syrup", amount: 0.5, unit: "OZ" },
      { name: "Lemon Juice", amount: 0.5, unit: "OZ" },
    ],
  },
  {
    name: "RAKI ROLLIE",
    portionCount: 15,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Efe Green Raki", amount: 1.25, unit: "OZ" },
      { name: "Well Vodka", amount: 0.75, unit: "OZ" },
      { name: "Simple Syrup", amount: 0.25, unit: "OZ" },
      { name: "Ginger Syrup", amount: 0.75, unit: "OZ" },
      { name: "Lime Juice", amount: 0.5, unit: "OZ" },
      { name: "Cucumber Juice", amount: 1, unit: "OZ" },
    ],
  },
  {
    name: "COSMEYPOLITAN",
    portionCount: 15,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Hanson Meyerlemon Vodka", amount: 1.5, unit: "OZ" },
      { name: "Dry Curacao", amount: 0.5, unit: "OZ" },
      { name: "Ginger Syrup", amount: 0.5, unit: "OZ" },
      { name: "Pomegranate Juice", amount: 0.5, unit: "OZ" },
      { name: "Lime Juice", amount: 0.5, unit: "OZ" },
    ],
  },
  {
    name: "NARGARITA",
    portionCount: 15,
    dilutionPct: 0,
    glassType: "Rock Glass",
    iceType: "Big Clear Ice Cube",
    garnish: "Lime Wheel",
    pourFromBatch: "4oz",
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "El Tosoro Blanco Tequila", amount: 2, unit: "OZ" },
      { name: "Pama Pomegranate Liq", amount: 0.75, unit: "OZ" },
      { name: "Amaro Nonino", amount: 0.75, unit: "OZ" },
      { name: "Pomegranate Juice", amount: 1, unit: "OZ" },
      { name: "Lime Juice", amount: 0.75, unit: "OZ" },
      { name: "Cinnamon Syrup", amount: 0.5, unit: "OZ" },
    ],
  },
  {
    name: "PRINCE NEGRONI",
    portionCount: 15,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Sipsmith Gin", amount: 1, unit: "OZ" },
      { name: "Carpano Antica Sweet Vermouth", amount: 1, unit: "OZ" },
      { name: "Fugit Gran Classico", amount: 1, unit: "OZ" },
    ],
  },
  {
    name: "CAPPADOCIA FIRE",
    portionCount: 20,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: "Roasted Serrano Pepper",
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    notes: "OR ANATOLIAN SUNSET (FOR MEZE & KEBAB use Plain Mezcal)",
    ingredients: [
      { name: "Madre Mezcal", amount: 1.5, unit: "OZ" },
      { name: "Aperol", amount: 0.75, unit: "OZ" },
      { name: "Accompani Flora Green", amount: 0.75, unit: "OZ" },
      { name: "Lime Juice", amount: 0.75, unit: "OZ" },
    ],
  },
  {
    name: "LAST SIP",
    portionCount: 10,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: "Orange Express",
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Mozart Dark Chocolate Liq", amount: 2, unit: "OZ" },
      { name: "Lime Juice", amount: 0.5, unit: "OZ" },
      { name: "Cointreau", amount: 0.5, unit: "OZ" },
      { name: "Scrappy's Chocolate Bitter", amount: 3, unit: "DASH" },
    ],
  },
  {
    name: "MEYHOUSE VESPER MARTINI",
    portionCount: 15,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: "Orange Express",
    pourFromBatch: "4.5oz",
    howTo: null,
    storageType: "FREEZER",
    noBatching: false,
    ingredients: [
      { name: "Hanson Meyerlemon Vodka", amount: 1, unit: "OZ" },
      { name: "Monkey 47 Gin", amount: 3, unit: "OZ" },
      { name: "Lillet Blanc", amount: 0.5, unit: "OZ" },
      { name: "Lavender Bitters", amount: 3, unit: "DASH" },
    ],
  },
  {
    name: "MEDI FIZZ",
    portionCount: 1,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: "Slice of Half Wheel Grapefruit",
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: true,
    ingredients: [
      { name: "Well Gin", amount: 2, unit: "OZ" },
      { name: "Fever Tree Mediterranean Tonic", amount: 0, unit: "OZ", isTopOff: true },
    ],
  },
  {
    name: "CHILEAN FASHION",
    portionCount: 15,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: "Orange Express",
    pourFromBatch: "2.5oz",
    howTo: null,
    storageType: "FREEZER",
    noBatching: false,
    ingredients: [
      { name: "Lapostelle XO Pisco", amount: 2, unit: "OZ" },
      { name: "Scrappy's Chocolate Bitter", amount: 3, unit: "DASH" },
      { name: "Cinnamon Syrup", amount: 0.5, unit: "OZ" },
    ],
  },
  {
    name: "BODRUM FASHION",
    portionCount: 20,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: "2.5oz",
    howTo: null,
    storageType: "FRIDGE",
    noBatching: false,
    ingredients: [
      { name: "Whistle Pig Piggy Back 6yr RYE", amount: 2, unit: "OZ" },
      { name: "Angostura Bitter", amount: 3, unit: "DASH" },
      { name: "Sage Tea Syrup", amount: 0.5, unit: "OZ" },
    ],
  },
  {
    name: "NAR 75 NA",
    portionCount: 20,
    dilutionPct: 0,
    glassType: "Collin",
    iceType: "Regular Ice",
    garnish: "Rosemary & Grapefruit Half Wheel",
    pourFromBatch: "4.25oz",
    howTo: "Pour into shaker with ice, shake well. Pour into Collin glass with fresh ice, then top it with Med. Fever Tonic.",
    storageType: "FRIDGE",
    noBatching: false,
    ingredients: [
      { name: "POM Pomegranate Juice", amount: 2, unit: "OZ" },
      { name: "Lemon Juice", amount: 0.75, unit: "OZ" },
      { name: "Cinnamon Syrup", amount: 0.75, unit: "OZ" },
      { name: "Simple Syrup", amount: 0.75, unit: "OZ" },
      { name: "Fever Tree Mediterranean Tonic", amount: 0, unit: "OZ", isTopOff: true },
    ],
  },
  {
    name: "GINGER 75 NA",
    portionCount: 25,
    dilutionPct: 0,
    glassType: "Collin",
    iceType: "Regular Ice",
    garnish: "Rosemary & Grapefruit Half Wheel",
    pourFromBatch: "4.25oz",
    howTo: "Pour into shaker with ice, shake well. Pour into Collin glass with fresh ice, then top it with Med. Fever Tonic.",
    storageType: "FRIDGE",
    noBatching: false,
    ingredients: [
      { name: "Seedlip Spice", amount: 2, unit: "OZ" },
      { name: "Lemon Juice", amount: 0.75, unit: "OZ" },
      { name: "Ginger Syrup", amount: 0.75, unit: "OZ" },
      { name: "Simple Syrup", amount: 0.75, unit: "OZ" },
      { name: "Fever Tree Mediterranean Tonic", amount: 0, unit: "OZ", isTopOff: true },
    ],
  },
];

const CLASSIC_COCKTAILS = [
  {
    name: "MARGARITA",
    portionCount: 15,
    dilutionPct: 20,
    glassType: "Double Old Fashion",
    iceType: "Rocks",
    garnish: "Lime + Salt rim",
    pourFromBatch: null,
    howTo: "Shake",
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Desired Tequila", amount: 1.5, unit: "OZ" },
      { name: "Cointreau", amount: 0.75, unit: "OZ" },
      { name: "Lime Juice", amount: 1.1, unit: "OZ" },
      { name: "Simple Syrup", amount: 0.75, unit: "OZ" },
    ],
  },
  {
    name: "MANHATTAN",
    portionCount: 15,
    dilutionPct: 20,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Desired Rye/Bourbon", amount: 2, unit: "OZ" },
      { name: "Sweet Vermouth", amount: 1, unit: "OZ" },
      { name: "Angostura Bitter", amount: 2, unit: "DASH" },
    ],
  },
  {
    name: "OLD FASHION",
    portionCount: 15,
    dilutionPct: 20,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Desired Bourbon/Rye", amount: 2, unit: "OZ" },
      { name: "Simple Syrup", amount: 0.25, unit: "OZ" },
      { name: "Angostura Bitter", amount: 2, unit: "DASH" },
    ],
  },
  {
    name: "NEGRONI",
    portionCount: 15,
    dilutionPct: 20,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Desired Gin", amount: 1, unit: "OZ" },
      { name: "Sweet Vermouth", amount: 1, unit: "OZ" },
      { name: "Campari", amount: 1, unit: "OZ" },
    ],
  },
  {
    name: "BOULEVARDIER",
    portionCount: 15,
    dilutionPct: 20,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Desired Bourbon", amount: 1.5, unit: "OZ" },
      { name: "Sweet Vermouth", amount: 1, unit: "OZ" },
      { name: "Campari", amount: 1, unit: "OZ" },
    ],
  },
  {
    name: "WHISKEY SOUR",
    portionCount: 15,
    dilutionPct: 20,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Desired Bourbon", amount: 2, unit: "OZ" },
      { name: "Lemon Juice", amount: 0.75, unit: "OZ" },
      { name: "Simple Syrup", amount: 0.75, unit: "OZ" },
    ],
  },
  {
    name: "AMARETTO SOUR",
    portionCount: 15,
    dilutionPct: 20,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Amaretto", amount: 1.5, unit: "OZ" },
      { name: "Desired Bourbon", amount: 0.75, unit: "OZ" },
      { name: "Lemon Juice", amount: 1, unit: "OZ" },
      { name: "Simple Syrup", amount: 0.5, unit: "OZ" },
    ],
  },
  {
    name: "MOSCOW MULE",
    portionCount: 15,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Desired Vodka", amount: 2, unit: "OZ" },
      { name: "Lime Juice", amount: 0.75, unit: "OZ" },
      { name: "Ginger Beer", amount: 0, unit: "OZ", isTopOff: true },
    ],
  },
  {
    name: "AMERICANO",
    portionCount: 15,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Campari", amount: 1.5, unit: "OZ" },
      { name: "Sweet Vermouth", amount: 1.5, unit: "OZ" },
      { name: "Club Soda", amount: 0, unit: "OZ", isTopOff: true },
    ],
  },
  {
    name: "APEROL SPRITZ",
    portionCount: 15,
    dilutionPct: 0,
    glassType: null,
    iceType: null,
    garnish: null,
    pourFromBatch: null,
    howTo: null,
    storageType: "NONE",
    noBatching: false,
    ingredients: [
      { name: "Aperol", amount: 2, unit: "OZ" },
      { name: "Prosecco", amount: 3, unit: "OZ" },
      { name: "Club Soda", amount: 0, unit: "OZ", isTopOff: true },
    ],
  },
];

async function main() {
  console.log("Seeding database...");

  // Create default owner
  const passwordHash = await bcrypt.hash("meyhouse123", 12);

  const org = await prisma.organization.upsert({
    where: { slug: "meyhouse" },
    update: {},
    create: {
      name: "Meyhouse",
      slug: "meyhouse",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "owner@meyhouse.com" },
    update: {},
    create: {
      name: "Refet",
      email: "owner@meyhouse.com",
      passwordHash,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: org.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      organizationId: org.id,
      role: "OWNER",
      permissions: JSON.stringify({
        viewRecipes: true,
        viewCosts: true,
        editRecipes: true,
        manageInventory: true,
        manageUsers: true,
        manageSettings: true,
      }),
    },
  });

  // Create categories
  const craftCat = await prisma.category.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Craft Cocktails" } },
    update: {},
    create: { organizationId: org.id, name: "Craft Cocktails", sortOrder: 0, defaultCostTargetPct: 20 },
  });

  const classicCat = await prisma.category.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Classic Cocktails" } },
    update: {},
    create: { organizationId: org.id, name: "Classic Cocktails", sortOrder: 1, defaultCostTargetPct: 22 },
  });

  await prisma.category.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Seasonal Cocktails" } },
    update: {},
    create: { organizationId: org.id, name: "Seasonal Cocktails", sortOrder: 2, defaultCostTargetPct: 20 },
  });

  await prisma.category.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Non-Alcoholic" } },
    update: {},
    create: { organizationId: org.id, name: "Non-Alcoholic", sortOrder: 3, defaultCostTargetPct: 30 },
  });

  // Collect all unique ingredient names
  const allRecipes = [
    ...CRAFT_COCKTAILS.map((r) => ({ ...r, categoryId: craftCat.id })),
    ...CLASSIC_COCKTAILS.map((r) => ({ ...r, categoryId: classicCat.id })),
  ];

  const ingredientNames = new Set<string>();
  for (const recipe of allRecipes) {
    for (const ing of recipe.ingredients) {
      ingredientNames.add(ing.name);
    }
  }

  // Create ingredients
  const ingredientMap = new Map<string, string>();
  for (const name of ingredientNames) {
    const ing = await prisma.ingredient.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: {
        organizationId: org.id,
        name,
        type: "LIQUID",
        bottleSizeMl: 750,
      },
    });
    ingredientMap.set(name, ing.id);
  }

  console.log(`Created ${ingredientMap.size} ingredients`);

  // Create recipes
  for (let i = 0; i < allRecipes.length; i++) {
    const r = allRecipes[i];

    // Check if recipe already exists
    const existing = await prisma.recipe.findFirst({
      where: { organizationId: org.id, name: r.name },
    });
    if (existing) {
      console.log(`  Skipping ${r.name} (already exists)`);
      continue;
    }

    await prisma.recipe.create({
      data: {
        organizationId: org.id,
        categoryId: r.categoryId,
        name: r.name,
        portionCount: r.portionCount,
        dilutionPct: r.dilutionPct,
        glassType: r.glassType,
        iceType: r.iceType,
        garnish: r.garnish,
        pourFromBatch: r.pourFromBatch,
        howTo: r.howTo,
        storageType: r.storageType,
        noBatching: r.noBatching,
        notes: (r as any).notes || null,
        sortOrder: i,
        ingredients: {
          create: r.ingredients.map((ing, j) => ({
            ingredientId: ingredientMap.get(ing.name)!,
            amount: ing.amount,
            unit: ing.unit,
            sortOrder: j,
            isTopOff: (ing as any).isTopOff || false,
          })),
        },
      },
    });
    console.log(`  Created recipe: ${r.name}`);
  }

  console.log("Seed completed successfully!");
  console.log("");
  console.log("Login credentials:");
  console.log("  Email: owner@meyhouse.com");
  console.log("  Password: meyhouse123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
