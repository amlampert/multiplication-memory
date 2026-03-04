# Correction System Specification

## Test 1

choose level 0

1. 0x0 right -> graduate to level 1

## Test 2

choose level 0

1. 0x0 wrong -> repeat 0x0 until 3/3 corrections are complete, then graduate

## Test 3

choose level 5

1. current level question 5x5 wrong
2. immediate correction 5 x 5 right (1/3 correction completed)
3. lower level review question 2x3 right
4. correction 5x5 right (2/3 correction completed)
5. lower level review question 4x4 right
6. correction 5x5 right (3/3 correction completed)
7. lower level review question 2x2 right
8. current level question 5x4

## Test 4

choose level 5

1. current level question 5x5 wrong
2. immediate correction 5 x 5 right (1/3 correction completed)
3. lower level review question 2x3 wrong
4. immediate correction 2x3 right (1/3 correction completed)
5. correction 5x5 right (2/3 correction completed)
6. previous review correction 2x3 right (2/3 correction completed)
7. correction 5x5 right (3/3 correction completed)
8. previous review correction 2x3 right (3/3 correction completed)
9. current level question 5x4

## Test 5: Miss a correction during the cycle

Level 5

1. 5x5 MISS - current level question
2. 5x5 RIGHT (1/3) - immediate re-ask
3. 2x3 RIGHT - lower level review (queue = 1)
4. 5x5 MISS (reset to 0/3) - current level correction is missed
5. 5x5 RIGHT (1/3) - immediate re-ask
6. 1x4 RIGHT - lower level review (queue = 1)
7. 5x5 RIGHT (2/3) - current level correction
8. 3x2 RIGHT - lower level review (queue = 1)
9. 5x5 RIGHT (3/3 COMPLETE) - current level correction
10. 0x4 RIGHT - lower level review (queue = 1)
11. 4x5 - current level question, normal alternation resumes

## Test 6

Level 5

1. 5x5 MISS - current level question
2. 5x5 RIGHT (1/3) - immediate correction
3. 2x3 RIGHT - lower level review question
4. 5x5 RIGHT (2/3) - correction
5. 4x4 RIGHT - lower level review question
6. 5x5 RIGHT (3/3 COMPLETE) - correction
7. 2x2 MISS - lower level review question
8. 2x2 RIGHT (1/3) - immediate correction
9. 5x4 RIGHT - current level question (queue = 1)
10. 2x2 RIGHT (2/3) - correction
11. 3x5 RIGHT - current level question
12. 2x2 RIGHT (3/3 COMPLETE) - correction
13. 4x5 RIGHT - current level question
14. Normal alternation continues

## Test 7

Level 5

1. 5x5 MISS - current level question
2. 5x5 RIGHT (1/3) - immediate correction
3. 2x3 MISS - lower level review question
4. 2x3 RIGHT (1/3) - immediate correction
5. 5x5 MISS (reset to 0/3) - current level correction is missed
6. 5x5 RIGHT (1/3) - immediate correction
7. 2x3 RIGHT (2/3) - lower level correction (queue = 2)
8. 5x5 RIGHT (2/3) - current level correction
9. 2x3 RIGHT (3/3 COMPLETE) - lower level correction
10. 5x5 RIGHT (3/3 COMPLETE) - current level correction
11. 1x4 RIGHT - lower level review question
12. 5x4 RIGHT - current level question

## Test 8

Level 5

1. 5x5 MISS - current level question
2. 5x5 RIGHT (1/3) - immediate correction
3. 2x3 MISS - lower level review question
4. 2x3 RIGHT (1/3) - immediate correction
5. 5x5 RIGHT (2/3) - current level correction (queue = 2)
6. 2x3 MISS (reset to 0/3) - lower level correction (queue = 2)
7. 2x3 RIGHT (1/3) - immediate correction
8. 5x5 RIGHT (3/3 COMPLETE) - current level correction (queue = 2, now = 1)
9. 2x3 RIGHT (2/3) - lower level correction (queue = 1)
10. 4x5 RIGHT - current level question (queue = 1, new questions allowed)
11. 2x3 RIGHT (3/3 COMPLETE) - lower level correction
12. 3x5 RIGHT - current level question (different from line 10)

## Test 9

Level 0

1. 0x0 MISS - current level question
2. 0x0 RIGHT (1/3) - immediate correction
3. 0x0 RIGHT (2/3) - no lower level exists, repeat 0x0
4. 0x0 RIGHT (3/3 COMPLETE) - correction complete
5. Graduate to level 1

## Rules

1. every time a question is missed, the corrections for that question should reset to 0/3
2. for every level except 0, questions should alternate between current level and random lower level review
3. when all current level questions have been answer correctly and all corrections are at 3/3, graduation should occur
4. the corrections queue should never have more than 2, because missed current and review questions must be corrected before new questions can be introduced
5. graduation should only occur when all corrections are complete AND all current level questions have been fulfilled
6. lower level review questions follow this priority:
   1. Due review items from queue
   2. Corrections
   3. MissedEver (with some probability)
   4. Random from easier levels (0 to level-1)
