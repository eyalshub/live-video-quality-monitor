-- Runs only on the first start of an empty volume.
-- Separate database for the automated tests so they never touch dev data.
CREATE DATABASE vqm_test OWNER vqm;
