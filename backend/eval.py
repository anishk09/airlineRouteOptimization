"""
Measure how often the model's SQL returns the same answer as hand-written SQL.

Usage:  python eval.py            (uses eval_questions.json)

A question passes if both queries return the same set of rows. Column names and
row order are ignored, since there are many correct ways to write the same query.
"""
import json

import psycopg

from app import ModelError, generate_and_run, run_sql


def normalize(rows):
    # Compare values only, rounded so 0.8231 and 0.823 count as equal
    def clean(value):
        try:
            return round(float(value), 2)
        except (TypeError, ValueError):
            return str(value)
    return sorted(tuple(clean(v) for v in row) for row in rows)


def main():
    with open("eval_questions.json") as f:
        cases = json.load(f)

    passed = 0
    for case in cases:
        _, gold_rows = run_sql(case["gold_sql"])
        try:
            sql, _, rows = generate_and_run(case["question"])
            ok = normalize(rows) == normalize(gold_rows)
        except (ModelError, ValueError, psycopg.Error) as error:
            sql, ok = f"ERROR: {error}", False

        passed += ok
        print(f"[{'PASS' if ok else 'FAIL'}] {case['question']}")
        if not ok:
            print(f"    model SQL: {sql}")

    print(f"\n{passed}/{len(cases)} passed ({passed / len(cases):.0%})")


if __name__ == "__main__":
    main()
