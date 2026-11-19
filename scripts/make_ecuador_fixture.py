#!/usr/bin/env python3
"""Generates scripts/fixtures/ecuador_halftime_2026.html — a faithful
reconstruction of the SoccerSTATS en-gb halftime page for Ecuador - Liga Pro
(snapshot taken 2026-11-09), used as the regression fixture for the
'First / Second Half tables' summary-heading bug (Task 18).

Page shape (new en-gb redesign):
  h1 league heading
  h3 'First / Second Half tables' + Total/Home/Away quick links  <-- the trap:
      this summary heading used to be mis-read as a Second Half table title
  h4/h2 'First Half table (1-45 min.)'          -> table
  h4 'Second Half table (46-90 min.)'           -> table
  h4 'First Half table (AT HOME, 1-45 min.)'    -> table
  h4 'Second Half table (AT HOME, 46-90 min.)'  -> table
  h4 'First Half table (AWAY, 1-45 min.)'       -> table
  h4 'Second Half table (AWAY, 46-90 min.)'     -> table
  h3 'Scored / conceded at half-time' + tabs    -> 3 tables, NEW layout
      (4+ 3 2 1 0 Avg. | TEAM | Avg. 0 1 2 3 4+, zeros as '-', count cells)
  h3 'Record when leading at half-time' + tabs  -> 3 tables, Matches '4 out of 6'
  h3 'Record when trailing at half-time' + tabs -> 1 MERGED table (Total + Home
      blocks in one <table>) to prove the first-block-wins dedupe
"""
import os

# ---- verbatim table data from the live page (2026-11-09) ----
FH_O = [  # First Half table (1-45 min.) — real 1H data
    (1, 'Macara', 6, 4, 1, 1, 5, 1, '+4', 13),
    (2, 'Deportivo Cuenca', 6, 2, 4, 0, 4, 2, '+2', 10),
    (3, 'Leones del Norte', 6, 2, 3, 1, 4, 3, '+1', 9),
    (4, 'Libertad', 6, 2, 3, 1, 3, 2, '+1', 9),
    (5, 'Universidad Catolica', 6, 2, 3, 1, 3, 2, '+1', 9),
    (6, 'Manta', 5, 2, 2, 1, 6, 4, '+2', 8),
    (7, 'Tecnico Universitari', 5, 2, 2, 1, 4, 2, '+2', 8),
    (8, 'Emelec', 6, 2, 2, 2, 3, 2, '+1', 8),
    (9, 'Barcelona Guayaquil', 5, 2, 2, 1, 3, 3, '0', 8),
    (10, 'Independiente del Va', 5, 1, 3, 1, 3, 2, '+1', 6),
    (11, 'Orense', 6, 1, 3, 2, 3, 4, '-1', 6),
    (12, 'Aucas', 6, 1, 2, 3, 4, 7, '-3', 5),
    (13, 'Guayaquil City', 6, 1, 2, 3, 2, 5, '-3', 5),
    (14, 'Mushuc Runa', 5, 0, 4, 1, 4, 6, '-2', 4),
    (15, 'Delfin', 5, 0, 3, 2, 5, 8, '-3', 3),
    (16, 'LDU Quito', 6, 0, 3, 3, 2, 5, '-3', 3),
]
SH_O = [  # Second Half table (46-90 min.) — note Libertad is a 2H-heavy team
    (1, 'Delfin', 5, 4, 0, 1, 6, 2, '+4', 12),
    (2, 'Macara', 6, 3, 3, 0, 6, 3, '+3', 12),
    (3, 'Deportivo Cuenca', 6, 3, 2, 1, 4, 3, '+1', 11),
    (4, 'Libertad', 6, 3, 1, 2, 7, 4, '+3', 10),
    (5, 'LDU Quito', 6, 2, 3, 1, 5, 3, '+2', 9),
    (6, 'Orense', 6, 2, 3, 1, 4, 2, '+2', 9),
    (7, 'Guayaquil City', 6, 2, 3, 1, 4, 3, '+1', 9),
    (8, 'Independiente del Va', 5, 2, 2, 1, 5, 2, '+3', 8),
    (9, 'Leones del Norte', 6, 2, 1, 3, 5, 6, '-1', 7),
    (10, 'Emelec', 6, 2, 1, 3, 4, 7, '-3', 7),
    (11, 'Aucas', 6, 1, 3, 2, 3, 7, '-4', 6),
    (12, 'Barcelona Guayaquil', 5, 1, 2, 2, 4, 4, '0', 5),
    (13, 'Tecnico Universitari', 5, 1, 2, 2, 2, 3, '-1', 5),
    (14, 'Manta', 5, 1, 1, 3, 2, 5, '-3', 4),
    (15, 'Universidad Catolica', 6, 0, 3, 3, 2, 6, '-4', 3),
    (16, 'Mushuc Runa', 5, 0, 2, 3, 2, 5, '-3', 2),
]
FH_H = [
    (1, 'Libertad', 3, 2, 1, 0, 2, 0, '+2', 7),
    (2, 'Tecnico Universitari', 2, 2, 0, 0, 3, 0, '+3', 6),
    (3, 'Manta', 3, 2, 0, 1, 3, 1, '+2', 6),
    (4, 'Orense', 3, 1, 2, 0, 2, 0, '+2', 5),
    (5, 'Deportivo Cuenca', 3, 1, 2, 0, 2, 1, '+1', 5),
    (6, 'Macara', 3, 1, 1, 1, 2, 1, '+1', 4),
    (7, 'Delfin', 3, 0, 3, 0, 5, 5, '0', 3),
    (8, 'Leones del Norte', 3, 0, 3, 0, 2, 2, '0', 3),
    (9, 'Emelec', 3, 1, 0, 2, 1, 2, '-1', 3),
    (10, 'Mushuc Runa', 2, 0, 2, 0, 2, 2, '0', 2),
    (11, 'Barcelona Guayaquil', 2, 0, 2, 0, 1, 1, '0', 2),
    (12, 'Independiente del Va', 3, 0, 2, 1, 0, 1, '-1', 2),
    (13, 'Universidad Catolica', 2, 0, 1, 1, 1, 2, '-1', 1),
    (14, 'Guayaquil City', 3, 0, 1, 2, 0, 3, '-3', 1),
    (15, 'Aucas', 4, 0, 1, 3, 2, 6, '-4', 1),
    (16, 'LDU Quito', 3, 0, 0, 3, 0, 3, '-3', 0),
]
SH_H = [
    (1, 'Delfin', 3, 3, 0, 0, 5, 0, '+5', 9),
    (2, 'Macara', 3, 3, 0, 0, 4, 1, '+3', 9),
    (3, 'LDU Quito', 3, 2, 1, 0, 5, 1, '+4', 7),
    (4, 'Independiente del Va', 3, 2, 1, 0, 4, 0, '+4', 7),
    (5, 'Guayaquil City', 3, 2, 1, 0, 4, 0, '+4', 7),
    (6, 'Deportivo Cuenca', 3, 2, 1, 0, 3, 1, '+2', 7),
    (7, 'Libertad', 3, 2, 0, 1, 5, 1, '+4', 6),
    (8, 'Orense', 3, 1, 2, 0, 3, 1, '+2', 5),
    (9, 'Leones del Norte', 3, 1, 1, 1, 4, 3, '+1', 4),
    (10, 'Tecnico Universitari', 2, 1, 0, 1, 1, 1, '0', 3),
    (11, 'Aucas', 4, 0, 3, 1, 2, 5, '-3', 3),
    (12, 'Barcelona Guayaquil', 2, 0, 2, 0, 1, 1, '0', 2),
    (13, 'Mushuc Runa', 2, 0, 1, 1, 1, 2, '-1', 1),
    (14, 'Universidad Catolica', 2, 0, 1, 1, 0, 1, '-1', 1),
    (15, 'Manta', 3, 0, 1, 2, 0, 2, '-2', 1),
    (16, 'Emelec', 3, 0, 1, 2, 0, 3, '-3', 1),
]
FH_A = [
    (1, 'Macara', 3, 3, 0, 0, 3, 0, '+3', 9),
    (2, 'Universidad Catolica', 4, 2, 2, 0, 2, 0, '+2', 8),
    (3, 'Leones del Norte', 3, 2, 0, 1, 2, 1, '+1', 6),
    (4, 'Barcelona Guayaquil', 3, 2, 0, 1, 2, 2, '0', 6),
    (5, 'Emelec', 3, 1, 2, 0, 2, 0, '+2', 5),
    (6, 'Deportivo Cuenca', 3, 1, 2, 0, 2, 1, '+1', 5),
    (7, 'Independiente del Va', 2, 1, 1, 0, 3, 1, '+2', 4),
    (8, 'Aucas', 2, 1, 1, 0, 2, 1, '+1', 4),
    (9, 'Guayaquil City', 3, 1, 1, 1, 2, 2, '0', 4),
    (10, 'LDU Quito', 3, 0, 3, 0, 2, 2, '0', 3),
    (11, 'Manta', 2, 0, 2, 0, 3, 3, '0', 2),
    (12, 'Libertad', 3, 0, 2, 1, 1, 2, '-1', 2),
    (13, 'Tecnico Universitari', 3, 0, 2, 1, 1, 2, '-1', 2),
    (14, 'Mushuc Runa', 3, 0, 2, 1, 2, 4, '-2', 2),
    (15, 'Orense', 3, 0, 1, 2, 1, 4, '-3', 1),
    (16, 'Delfin', 2, 0, 0, 2, 0, 3, '-3', 0),
]
SH_A = [
    (1, 'Emelec', 3, 2, 0, 1, 4, 4, '0', 6),
    (2, 'Orense', 3, 1, 1, 1, 1, 1, '0', 4),
    (3, 'Libertad', 3, 1, 1, 1, 2, 3, '-1', 4),
    (4, 'Deportivo Cuenca', 3, 1, 1, 1, 1, 2, '-1', 4),
    (5, 'Barcelona Guayaquil', 3, 1, 0, 2, 3, 3, '0', 3),
    (6, 'Macara', 3, 0, 3, 0, 2, 2, '0', 3),
    (7, 'Manta', 2, 1, 0, 1, 2, 3, '-1', 3),
    (8, 'Aucas', 2, 1, 0, 1, 1, 2, '-1', 3),
    (9, 'Delfin', 2, 1, 0, 1, 1, 2, '-1', 3),
    (10, 'Leones del Norte', 3, 1, 0, 2, 1, 3, '-2', 3),
    (11, 'Tecnico Universitari', 3, 0, 2, 1, 1, 2, '-1', 2),
    (12, 'LDU Quito', 3, 0, 2, 1, 0, 2, '-2', 2),
    (13, 'Universidad Catolica', 4, 0, 2, 2, 2, 5, '-3', 2),
    (14, 'Guayaquil City', 3, 0, 2, 1, 0, 3, '-3', 2),
    (15, 'Independiente del Va', 2, 0, 1, 1, 1, 2, '-1', 1),
    (16, 'Mushuc Runa', 3, 0, 1, 2, 1, 3, '-2', 1),
]

# Scored / conceded at half-time — NEW layout rows verbatim:
#   (team, [s4, s3, s2, s1, s0, sAvg, cAvg, c0, c1, c2, c3, c4]) with None = '-'
DIST_TOTAL = [
    ('Aucas',                   [None, None, None, 4, 2, '0.67', '1.17', 1, 4, None, 1, None]),
    ('Barcelona Guayaquil',     [None, None, None, 3, 2, '0.60', '0.60', 3, 1, 1, None, None]),
    ('Delfin',                  [None, None, 2, 1, 2, '1.00', '1.60', None, 2, 3, None, None]),
    ('Deportivo Cuenca',        [None, None, None, 4, 2, '0.67', '0.33', 4, 2, None, None, None]),
    ('Emelec',                  [None, None, 1, 1, 4, '0.50', '0.33', 4, 2, None, None, None]),
    ('Guayaquil City',          [None, None, None, 2, 4, '0.33', '0.83', 2, 3, 1, None, None]),
    ('Independiente del Va',    [None, None, None, 2, 4, '0.33', '0.40', 3, 2, None, None, None]),
    ('LDU Quito',               [None, None, None, 2, 4, '0.33', '0.83', 1, 5, None, None, None]),
    ('Leones del Norte',        [None, None, None, 4, 2, '0.67', '0.50', 3, 3, None, None, None]),
    ('Libertad',                [None, None, None, 3, 3, '0.50', '0.33', 4, 2, None, None, None]),
    ('Macara',                  [None, None, 1, 3, 2, '0.83', '0.17', 5, 1, None, None, None]),
    ('Manta',                   [None, None, 2, 2, 1, '1.20', '0.80', 2, 2, 1, None, None]),
    ('Mushuc Runa',             [None, None, 1, 2, 2, '0.80', '1.20', 1, 2, 2, None, None]),
    ('Orense',                  [None, None, 1, 1, 4, '0.50', '0.67', 3, 2, 1, None, None]),
    ('Tecnico Universitari',    [None, None, 1, 2, 2, '0.80', '0.40', 3, 2, None, None, None]),
    ('Universidad Catolica',    [None, None, None, 3, 3, '0.50', '0.33', 4, 2, None, None, None]),
]
DIST_HOME = [
    ('Aucas',                   [None, None, None, 2, 2, '0.50', '1.50', None, 3, None, 1, None]),
    ('Barcelona Guayaquil',     [None, None, None, 1, 1, '0.50', '0.50', 1, 1, None, None, None]),
    ('Delfin',                  [None, None, 2, 1, None, '1.67', '1.67', None, 1, 2, None, None]),
    ('Deportivo Cuenca',        [None, None, None, 2, 1, '0.67', '0.33', 2, 1, None, None, None]),
    ('Emelec',                  [None, None, None, 1, 2, '0.33', '0.67', 1, 2, None, None, None]),
    ('Guayaquil City',          [None, None, None, None, 3, '0.00', '1.00', 1, 1, 1, None, None]),
    ('Independiente del Va',    [None, None, None, None, 3, '0.00', '0.33', 2, 1, None, None, None]),
    ('LDU Quito',               [None, None, None, None, 3, '0.00', '1.00', None, 3, None, None, None]),
    ('Leones del Norte',        [None, None, None, 2, 1, '0.67', '0.67', 1, 2, None, None, None]),
    ('Libertad',                [None, None, None, 2, 1, '0.67', '0.00', 3, None, None, None, None]),
    ('Macara',                  [None, None, 1, None, 2, '0.67', '0.33', 2, 1, None, None, None]),
    ('Manta',                   [None, None, 1, 1, 1, '1.00', '0.33', 2, 1, None, None, None]),
    ('Mushuc Runa',             [None, None, None, 2, None, '1.00', '1.00', None, 2, None, None, None]),
    ('Orense',                  [None, None, 1, None, 2, '0.67', '0.00', 3, None, None, None, None]),
    ('Tecnico Universitari',    [None, None, 1, 1, None, '1.50', '0.00', 2, None, None, None, None]),
    ('Universidad Catolica',    [None, None, None, 1, 1, '0.50', '1.00', None, 2, None, None, None]),
]
DIST_AWAY = [
    ('Aucas',                   [None, None, None, 2, None, '1.00', '0.50', 1, 1, None, None, None]),
    ('Barcelona Guayaquil',     [None, None, None, 2, 1, '0.67', '0.67', 2, None, 1, None, None]),
    ('Delfin',                  [None, None, None, None, 2, '0.00', '1.50', None, 1, 1, None, None]),
    ('Deportivo Cuenca',        [None, None, None, 2, 1, '0.67', '0.33', 2, 1, None, None, None]),
    ('Emelec',                  [None, None, 1, None, 2, '0.67', '0.00', 3, None, None, None, None]),
    ('Guayaquil City',          [None, None, None, 2, 1, '0.67', '0.67', 1, 2, None, None, None]),
    ('Independiente del Va',    [None, 1, None, None, 1, '1.50', '0.50', 1, 1, None, None, None]),
    ('LDU Quito',               [None, None, None, 2, 1, '0.67', '0.67', 1, 2, None, None, None]),
    ('Leones del Norte',        [None, None, None, 2, 1, '0.67', '0.33', 2, 1, None, None, None]),
    ('Libertad',                [None, None, None, 1, 2, '0.33', '0.67', 1, 2, None, None, None]),
    ('Macara',                  [None, None, None, 3, None, '1.00', '0.00', 3, None, None, None, None]),
    ('Manta',                   [None, None, 1, 1, None, '1.50', '1.50', None, 1, 1, None, None]),
    ('Mushuc Runa',             [None, None, 1, None, 2, '0.67', '1.33', 1, None, 2, None, None]),
    ('Orense',                  [None, None, None, 1, 2, '0.33', '1.33', None, 2, 1, None, None]),
    ('Tecnico Universitari',    [None, None, None, 1, 2, '0.33', '0.67', 1, 2, None, None, None]),
    ('Universidad Catolica',    [None, None, None, 2, 2, '0.50', '0.00', 4, None, None, None, None]),
]
DIST_LAVG_TOTAL = ['0%', '1%', '10%', '41%', '48%', '0.64', 'League avg.', '0.64', '48%', '41%', '10%', '1%', '0%']
DIST_LAVG_HOME = ['0%', '0%', '13%', '36%', '51%', '0.62', 'League avg.', '0.62', '51%', '36%', '13%', '0%', '0%']
DIST_LAVG_AWAY = ['0%', '2%', '7%', '47%', '44%', '0.67', 'League avg.', '0.67', '44%', '47%', '7%', '2%', '0%']

# Record when leading at half-time — Total block verbatim (Matches = 'N out of M')
LEAD_TOTAL = [
    ('Macara', '4 out of 6', '67%', 4, 0, 0, '8 - 2', 12, '3.00'),
    ('Libertad', '2 out of 6', '33%', 2, 0, 0, '7 - 0', 6, '3.00'),
    ('Deportivo Cuenca', '2 out of 6', '33%', 2, 0, 0, '4 - 0', 6, '3.00'),
    ('Manta', '2 out of 5', '40%', 2, 0, 0, '3 - 1', 6, '3.00'),
    ('Orense', '1 out of 6', '17%', 1, 0, 0, '4 - 0', 3, '3.00'),
    ('Independiente del Va', '1 out of 5', '20%', 1, 0, 0, '4 - 2', 3, '3.00'),
    ('Guayaquil City', '1 out of 6', '17%', 1, 0, 0, '1 - 0', 3, '3.00'),
    ('Tecnico Universitari', '2 out of 5', '40%', 1, 1, 0, '4 - 1', 4, '2.00'),
    ('Leones del Norte', '2 out of 6', '33%', 1, 1, 0, '3 - 1', 4, '2.00'),
    ('Barcelona Guayaquil', '2 out of 5', '40%', 1, 0, 1, '5 - 2', 3, '1.50'),
    ('Universidad Catolica', '2 out of 6', '33%', 0, 1, 1, '3 - 4', 1, '0.50'),
    ('Delfin', '0 out of 5', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('LDU Quito', '0 out of 6', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Mushuc Runa', '0 out of 5', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Aucas', '1 out of 6', '17%', 0, 0, 1, '1 - 2', 0, '0.00'),
    ('Emelec', '2 out of 6', '33%', 0, 0, 2, '3 - 5', 0, '0.00'),
]
# Home/Away leading blocks — synthesized (only the Total block is imported)
LEAD_HOME = [
    ('Libertad', '2 out of 3', '67%', 2, 0, 0, '4 - 0', 6, '3.00'),
    ('Manta', '2 out of 3', '67%', 2, 0, 0, '3 - 1', 6, '3.00'),
    ('Macara', '2 out of 3', '67%', 2, 0, 0, '4 - 1', 6, '3.00'),
    ('Tecnico Universitari', '2 out of 2', '100%', 1, 1, 0, '4 - 1', 4, '2.00'),
    ('Orense', '1 out of 3', '33%', 1, 0, 0, '4 - 0', 3, '3.00'),
    ('Deportivo Cuenca', '1 out of 3', '33%', 1, 0, 0, '2 - 0', 3, '3.00'),
    ('Independiente del Va', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Delfin', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Barcelona Guayaquil', '1 out of 2', '50%', 1, 0, 0, '3 - 1', 3, '3.00'),
    ('Leones del Norte', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Universidad Catolica', '0 out of 2', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Guayaquil City', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Aucas', '0 out of 4', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Emelec', '1 out of 3', '33%', 0, 0, 1, '1 - 2', 0, '0.00'),
    ('Mushuc Runa', '0 out of 2', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('LDU Quito', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
]
LEAD_AWAY = [
    ('Macara', '2 out of 3', '67%', 2, 0, 0, '4 - 1', 6, '3.00'),
    ('Barcelona Guayaquil', '1 out of 3', '33%', 0, 0, 1, '2 - 1', 0, '0.00'),
    ('Independiente del Va', '1 out of 2', '50%', 1, 0, 0, '4 - 2', 3, '3.00'),
    ('Manta', '0 out of 2', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Libertad', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Universidad Catolica', '2 out of 4', '50%', 0, 1, 1, '3 - 4', 1, '0.50'),
    ('Leones del Norte', '2 out of 3', '67%', 1, 1, 0, '3 - 1', 4, '2.00'),
    ('Orense', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Deportivo Cuenca', '1 out of 3', '33%', 1, 0, 0, '2 - 0', 3, '3.00'),
    ('Guayaquil City', '1 out of 3', '33%', 1, 0, 0, '1 - 0', 3, '3.00'),
    ('Aucas', '1 out of 2', '50%', 0, 0, 1, '1 - 2', 0, '0.00'),
    ('Tecnico Universitari', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Emelec', '1 out of 3', '33%', 0, 0, 1, '2 - 3', 0, '0.00'),
    ('LDU Quito', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Mushuc Runa', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Delfin', '0 out of 2', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
]

# Record when trailing at half-time — Total block (synthesized, consistent shapes).
# Home block is appended to the SAME table to prove first-block-wins dedupe.
TRAIL_TOTAL = [
    ('Aucas', '3 out of 6', '50%', 0, 1, 2, '2 - 6', 1, '0.33'),
    ('LDU Quito', '3 out of 6', '50%', 0, 2, 1, '3 - 5', 2, '0.67'),
    ('Delfin', '3 out of 5', '60%', 0, 1, 2, '2 - 7', 1, '0.33'),
    ('Guayaquil City', '2 out of 6', '33%', 0, 1, 1, '1 - 3', 1, '0.50'),
    ('Mushuc Runa', '2 out of 5', '40%', 0, 1, 1, '2 - 4', 1, '0.50'),
    ('Orense', '1 out of 6', '17%', 0, 0, 1, '0 - 2', 0, '0.00'),
    ('Emelec', '1 out of 6', '17%', 0, 0, 1, '0 - 2', 0, '0.00'),
    ('Barcelona Guayaquil', '1 out of 5', '20%', 0, 0, 1, '0 - 2', 0, '0.00'),
    ('Universidad Catolica', '1 out of 6', '17%', 0, 0, 1, '1 - 3', 0, '0.00'),
    ('Tecnico Universitari', '1 out of 5', '20%', 0, 0, 1, '0 - 2', 0, '0.00'),
    ('Leones del Norte', '1 out of 6', '17%', 0, 0, 1, '0 - 1', 0, '0.00'),
    ('Libertad', '1 out of 6', '17%', 0, 0, 1, '0 - 1', 0, '0.00'),
    ('Manta', '1 out of 5', '20%', 0, 0, 1, '0 - 2', 0, '0.00'),
    ('Independiente del Va', '1 out of 5', '20%', 0, 0, 1, '0 - 1', 0, '0.00'),
    ('Deportivo Cuenca', '0 out of 6', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Macara', '0 out of 6', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
]
TRAIL_HOME_MERGED = [
    ('Aucas', '2 out of 4', '50%', 0, 1, 1, '1 - 4', 1, '0.50'),
    ('LDU Quito', '2 out of 3', '67%', 0, 1, 1, '2 - 3', 1, '0.50'),
    ('Delfin', '2 out of 3', '67%', 0, 1, 1, '2 - 4', 1, '0.50'),
    ('Guayaquil City', '1 out of 3', '33%', 0, 1, 0, '1 - 2', 1, '1.00'),
    ('Mushuc Runa', '1 out of 2', '50%', 0, 1, 0, '1 - 2', 1, '1.00'),
    ('Orense', '1 out of 3', '33%', 0, 0, 1, '0 - 2', 0, '0.00'),
    ('Emelec', '1 out of 3', '33%', 0, 0, 1, '0 - 2', 0, '0.00'),
    ('Barcelona Guayaquil', '0 out of 2', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Universidad Catolica', '0 out of 2', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Tecnico Universitari', '0 out of 2', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Leones del Norte', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Libertad', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Manta', '1 out of 3', '33%', 0, 0, 1, '0 - 2', 0, '0.00'),
    ('Independiente del Va', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Deportivo Cuenca', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
    ('Macara', '0 out of 3', '0%', 0, 0, 0, '0 - 0', 0, '0.00'),
]


def league_table(rows):
    trs = ['<tr><th></th><th></th><th>GP</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>']
    for pos, team, gp, w, d, l, gf, ga, gd, pts in rows:
        trs.append(f'<tr><td>{pos}</td><td><a href="/team/x">{team}</a></td>'
                   f'<td>{gp}</td><td>{w}</td><td>{d}</td><td>{l}</td><td>{gf}</td><td>{ga}</td><td>{gd}</td><td>{pts}</td></tr>')
    return '<table><tbody>' + ''.join(trs) + '</tbody></table>'


def dist_table(rows, lavg):
    trs = [
        '<tr><th colspan="6">Goals scored at half-time</th><th></th><th colspan="5">Goals conceded at half-time</th></tr>',
        '<tr><th>4+</th><th>3</th><th>2</th><th>1</th><th>0</th><th>Avg.</th><th></th><th>Avg.</th><th>0</th><th>1</th><th>2</th><th>3</th><th>4+</th></tr>',
    ]
    for team, vals in rows:
        cells = ''.join('<td>-</td>' if v is None else f'<td>{v}</td>' for v in vals[:6])
        mid = f'<td><a href="/team/x">{team}</a></td>'
        rest = ''.join('<td>-</td>' if v is None else f'<td>{v}</td>' for v in vals[6:])
        trs.append(f'<tr>{cells}{mid}{rest}</tr>')
    trs.append('<tr>' + ''.join(f'<td>{c}</td>' for c in lavg) + '</tr>')
    return '<table><tbody>' + ''.join(trs) + '</tbody></table>'


def rec_header():
    return '<tr><th></th><th>Matches</th><th>Perc.</th><th>W</th><th>D</th><th>L</th><th>Goals</th><th>Pts</th><th>PPG</th></tr>'


def rec_row(team, matches, perc, w, d, l, goals, pts, ppg):
    m = matches if isinstance(matches, str) else f'<strong>{matches}</strong> out of N'
    return (f'<tr><td><a href="/team/x">{team}</a></td><td>{m}</td><td>{perc}</td>'
            f'<td>{w}</td><td>{d}</td><td>{l}</td><td>{goals}</td><td>{pts}</td><td>{ppg}</td></tr>')


def rec_table(rows, merged_home=None):
    trs = [rec_header()]
    for r in rows:
        team, matches, perc, w, d, l, goals, pts, ppg = r
        m = matches if isinstance(matches, str) else f'{matches} out of 6'
        trs.append(rec_row(team, m, perc, w, d, l, goals, pts, ppg))
    if merged_home:
        trs.append('<tr><td colspan="9">Home</td></tr>')
        for r in merged_home:
            team, matches, perc, w, d, l, goals, pts, ppg = r
            m = matches if isinstance(matches, str) else f'{matches} out of 3'
            trs.append(rec_row(team, m, perc, w, d, l, goals, pts, ppg))
    return '<table><tbody>' + ''.join(trs) + '</tbody></table>'


def tabs():
    return '<ul class="tabs"><li><a href="#">Total</a></li><li><a href="#">Home</a></li><li><a href="#">Away</a></li></ul>'


html = f'''<!DOCTYPE html>
<html lang="en-gb"><head><meta charset="utf-8">
<title>Ecuador - Liga Pro - First Half / Second Half stats - SoccerSTATS.com</title></head>
<body>
<div id="main">
<h1>Ecuador - liga-pro: Halftime</h1>
<h3>First / Second Half tables</h3>
{tabs()}
<div class="advert"><table><tbody><tr><td>1</td><td>Advertisement slot</td><td>x</td></tr></tbody></table></div>
<h4>First Half table (1-45 min.)</h4>
{league_table(FH_O)}
<h4>Second Half table (46-90 min.)</h4>
{league_table(SH_O)}
<h4>First Half table (AT HOME, 1-45 min.)</h4>
{league_table(FH_H)}
<h4>Second Half table (AT HOME, 46-90 min.)</h4>
{league_table(SH_H)}
<h4>First Half table (AWAY, 1-45 min.)</h4>
{league_table(FH_A)}
<h4>Second Half table (AWAY, 46-90 min.)</h4>
{league_table(SH_A)}
<h3>Scored / conceded at half-time</h3>
{tabs()}
{dist_table(DIST_TOTAL, DIST_LAVG_TOTAL)}
{dist_table(DIST_HOME, DIST_LAVG_HOME)}
{dist_table(DIST_AWAY, DIST_LAVG_AWAY)}
<h3>Record when leading at half-time</h3>
{tabs()}
<p>When team was leading at half-time (Total)</p>
{rec_table(LEAD_TOTAL)}
{rec_table(LEAD_HOME)}
{rec_table(LEAD_AWAY)}
<h3>Record when trailing at half-time</h3>
{tabs()}
{rec_table(TRAIL_TOTAL, merged_home=TRAIL_HOME_MERGED)}
</div>
</body></html>
'''

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'ecuador_halftime_2026.html')
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print('written', out, len(html), 'bytes')
