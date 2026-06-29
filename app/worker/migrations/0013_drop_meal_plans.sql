-- Drop the Week Plan feature entirely. Per-meal planning now happens through
-- the Meals tab chat flow; saved meals live in the `recipes` table.
-- Migration 0002_meal_plans.sql created this table.
DROP TABLE IF EXISTS meal_plans;
