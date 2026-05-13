# ============================================================
# PYTHON + DATABASE PRACTICE
# Day 2 — Core Infrastructure Solutions AI Course
# ============================================================
# This file shows students how to:
#   1. Create a database using Python (SQLite — no install needed!)
#   2. Create tables and insert data
#   3. Run SQL queries using Python
#   4. Load results into Pandas
#   5. Connect to MySQL (bonus — needs MySQL installed)
# ============================================================
# HOW TO RUN:
#   pip install pandas
#   python python_database_practice.py
# ============================================================

import sqlite3
import pandas as pd

print("=" * 60)
print("PYTHON + DATABASE PRACTICE")
print("Day 2 — Databases & SQL")
print("=" * 60)


# ============================================================
# STEP 1 — CREATE DATABASE & TABLES
# ============================================================
print("\n--- STEP 1: Create Database ---")

# sqlite3 creates a .db file automatically — no MySQL needed!
conn = sqlite3.connect("school.db")
cursor = conn.cursor()
print("Database 'school.db' created!")

# Drop tables if they exist (so we can re-run this script)
cursor.execute("DROP TABLE IF EXISTS orders")
cursor.execute("DROP TABLE IF EXISTS students")
cursor.execute("DROP TABLE IF EXISTS courses")

# Create students table
cursor.execute("""
    CREATE TABLE students (
        student_id   INTEGER PRIMARY KEY,
        name         TEXT    NOT NULL,
        age          INTEGER,
        city         TEXT,
        course       TEXT
    )
""")

# Create courses table
cursor.execute("""
    CREATE TABLE courses (
        course_id    INTEGER PRIMARY KEY,
        course_name  TEXT    NOT NULL,
        instructor   TEXT,
        duration_days INTEGER
    )
""")

# Create orders table (links students to courses)
cursor.execute("""
    CREATE TABLE orders (
        order_id    INTEGER PRIMARY KEY,
        student_id  INTEGER,
        course_id   INTEGER,
        amount      INTEGER,
        order_date  TEXT,
        FOREIGN KEY (student_id) REFERENCES students(student_id),
        FOREIGN KEY (course_id)  REFERENCES courses(course_id)
    )
""")

conn.commit()
print("Tables created: students, courses, orders")


# ============================================================
# STEP 2 — INSERT DATA
# ============================================================
print("\n--- STEP 2: Insert Data ---")

# Insert students
students_data = [
    (1, "Rahim Ahmed",   22, "Dhaka",      "AI Course"),
    (2, "Sara Islam",    20, "Chittagong", "AI Course"),
    (3, "Karim Hasan",   25, "Dhaka",      "Data Science"),
    (4, "Nadia Sultana", 21, "Sylhet",     "AI Course"),
    (5, "Farhan Ali",    23, "Dhaka",      "Web Dev"),
    (6, "Mitu Begum",    19, "Rajshahi",   "AI Course"),
    (7, "Rubel Mia",     24, "Khulna",     "Data Science"),
    (8, "Tania Akter",   22, "Dhaka",      "AI Course"),
]
cursor.executemany(
    "INSERT INTO students VALUES (?, ?, ?, ?, ?)",
    students_data
)

# Insert courses
courses_data = [
    (1, "AI Course",     "Dr. Rahman",  10),
    (2, "Data Science",  "Ms. Farida",   8),
    (3, "Web Dev",       "Mr. Kamal",    6),
    (4, "Cybersecurity", "Dr. Hasan",    5),
]
cursor.executemany(
    "INSERT INTO courses VALUES (?, ?, ?, ?)",
    courses_data
)

# Insert orders
orders_data = [
    (1,  1, 1, 15000, "2026-05-01"),
    (2,  2, 1, 15000, "2026-05-01"),
    (3,  3, 2, 12000, "2026-05-02"),
    (4,  4, 1, 15000, "2026-05-03"),
    (5,  5, 3,  8000, "2026-05-04"),
    (6,  6, 1, 15000, "2026-05-05"),
    (7,  7, 2, 12000, "2026-05-06"),
    (8,  8, 1, 15000, "2026-05-07"),
    (9,  1, 2, 12000, "2026-05-08"),  # Rahim enrolled in 2nd course
    (10, 3, 4,  9000, "2026-05-09"),  # Karim enrolled in cybersecurity
]
cursor.executemany(
    "INSERT INTO orders VALUES (?, ?, ?, ?, ?)",
    orders_data
)

conn.commit()
print(f"Inserted {len(students_data)} students")
print(f"Inserted {len(courses_data)} courses")
print(f"Inserted {len(orders_data)} orders")


# ============================================================
# STEP 3 — BASIC SQL QUERIES WITH PYTHON
# ============================================================
print("\n--- STEP 3: SQL Queries in Python ---")

# ── Query 1: SELECT all students ────────────────────────────
print("\nQuery 1: All students")
print("-" * 45)
cursor.execute("SELECT * FROM students")
rows = cursor.fetchall()
print(f"{'ID':<4} {'Name':<18} {'Age':<5} {'City':<14} {'Course'}")
print("-" * 60)
for row in rows:
    print(f"{row[0]:<4} {row[1]:<18} {row[2]:<5} {row[3]:<14} {row[4]}")

# ── Query 2: WHERE filter ────────────────────────────────────
print("\nQuery 2: Students from Dhaka only")
print("-" * 45)
cursor.execute("""
    SELECT name, age, course
    FROM students
    WHERE city = 'Dhaka'
    ORDER BY name ASC
""")
for row in cursor.fetchall():
    print(f"  {row[0]:<20} age={row[1]}  course={row[2]}")

# ── Query 3: COUNT + GROUP BY ────────────────────────────────
print("\nQuery 3: How many students per city?")
print("-" * 45)
cursor.execute("""
    SELECT city, COUNT(*) AS total_students
    FROM students
    GROUP BY city
    ORDER BY total_students DESC
""")
for row in cursor.fetchall():
    bar = "█" * row[1]
    print(f"  {row[0]:<14} {bar} ({row[1]})")

# ── Query 4: JOIN ─────────────────────────────────────────────
print("\nQuery 4: Student names with their course + amount (JOIN)")
print("-" * 60)
cursor.execute("""
    SELECT s.name, c.course_name, o.amount, o.order_date
    FROM students s
    INNER JOIN orders  o ON s.student_id = o.student_id
    INNER JOIN courses c ON o.course_id  = c.course_id
    ORDER BY o.amount DESC
""")
print(f"{'Name':<18} {'Course':<18} {'Amount (BDT)':>14}  {'Date'}")
print("-" * 65)
for row in cursor.fetchall():
    print(f"{row[0]:<18} {row[1]:<18} {row[2]:>14,}  {row[3]}")

# ── Query 5: GROUP BY + SUM ──────────────────────────────────
print("\nQuery 5: Total revenue per course")
print("-" * 45)
cursor.execute("""
    SELECT c.course_name,
           COUNT(o.order_id)  AS enrollments,
           SUM(o.amount)      AS total_revenue,
           AVG(o.amount)      AS avg_amount
    FROM courses c
    INNER JOIN orders o ON c.course_id = o.course_id
    GROUP BY c.course_name
    ORDER BY total_revenue DESC
""")
print(f"{'Course':<18} {'Enroll':>8} {'Revenue (BDT)':>15} {'Avg':>10}")
print("-" * 55)
for row in cursor.fetchall():
    print(f"{row[0]:<18} {row[1]:>8} {row[2]:>15,} {int(row[3]):>10,}")

# ── Query 6: Subquery ────────────────────────────────────────
print("\nQuery 6: Students who paid MORE than average amount")
print("-" * 50)
cursor.execute("""
    SELECT s.name, o.amount
    FROM students s
    JOIN orders o ON s.student_id = o.student_id
    WHERE o.amount > (SELECT AVG(amount) FROM orders)
    ORDER BY o.amount DESC
""")
for row in cursor.fetchall():
    print(f"  {row[0]:<20} BDT {row[1]:,}")


# ============================================================
# STEP 4 — LOAD SQL RESULTS INTO PANDAS
# ============================================================
print("\n--- STEP 4: SQL Results → Pandas DataFrame ---")

# pd.read_sql() runs a query and returns a DataFrame directly!
df_students = pd.read_sql(
    "SELECT * FROM students", conn
)
print("\nStudents DataFrame:")
print(df_students)

print(f"\nDataFrame shape: {df_students.shape}")
print(f"Column names   : {list(df_students.columns)}")

# Now use pandas on the result
print("\nStudents per course (using pandas groupby):")
print(df_students.groupby("course")["student_id"].count())

# Load the JOIN result into pandas
df_joined = pd.read_sql("""
    SELECT s.name, s.city, c.course_name, o.amount, o.order_date
    FROM students s
    JOIN orders  o ON s.student_id = o.student_id
    JOIN courses c ON o.course_id  = c.course_id
""", conn)

print("\nJoined DataFrame (students + orders + courses):")
print(df_joined)

print("\nTotal revenue per course (pandas):")
print(df_joined.groupby("course_name")["amount"].sum().sort_values(ascending=False))

print("\nStudent count per city (pandas):")
print(df_students["city"].value_counts())


# ============================================================
# STEP 5 — UPDATE & DELETE
# ============================================================
print("\n--- STEP 5: UPDATE and DELETE ---")

# UPDATE: change a student's city
cursor.execute("""
    UPDATE students
    SET city = 'Sylhet'
    WHERE name = 'Rahim Ahmed'
""")
conn.commit()
print("Updated Rahim Ahmed's city to Sylhet")

# Verify
cursor.execute("SELECT name, city FROM students WHERE name='Rahim Ahmed'")
print("After update:", cursor.fetchone())

# DELETE: remove a student
cursor.execute("DELETE FROM students WHERE student_id = 8")
conn.commit()
print("Deleted student_id = 8 (Tania Akter)")

cursor.execute("SELECT COUNT(*) FROM students")
print(f"Students remaining: {cursor.fetchone()[0]}")


# ============================================================
# STEP 6 — SAVE SQL RESULT TO CSV
# ============================================================
print("\n--- STEP 6: Save to CSV ---")

df_final = pd.read_sql("""
    SELECT s.name, s.city, c.course_name,
           o.amount, o.order_date
    FROM students s
    JOIN orders  o ON s.student_id = o.student_id
    JOIN courses c ON o.course_id  = c.course_id
    ORDER BY s.name
""", conn)

df_final.to_csv("query_results.csv", index=False)
print("Saved results to query_results.csv")
print(df_final)


# ============================================================
# CLOSE CONNECTION
# ============================================================
conn.close()
print("\n--- Database connection closed ---")

print("\n" + "=" * 60)
print("ALL STEPS COMPLETE!")
print("=" * 60)
print("""
FILES CREATED:
  school.db          <- your SQLite database file
  query_results.csv  <- exported query results

WHAT YOU LEARNED:
  sqlite3.connect()  -> create/open a database
  cursor.execute()   -> run any SQL query
  cursor.fetchall()  -> get all results as list
  pd.read_sql()      -> SQL query directly into DataFrame
  df.to_csv()        -> save DataFrame back to file

NEXT STEP — Connect to REAL MySQL:
  import pymysql
  conn = pymysql.connect(
      host='localhost', user='root',
      password='yourpassword', database='yourdb'
  )
  df = pd.read_sql("SELECT * FROM your_table", conn)
  conn.close()
""")
print("=" * 60)

# ============================================================
# PRACTICE EXERCISES (students do these)
# ============================================================
print("""
YOUR TURN — EXERCISES:
======================

1. EASY: Add 3 more students to the students table
   using cursor.execute() with INSERT INTO.

2. EASY: Write a query to find all students
   whose age is less than 22.

3. MEDIUM: Write a query using JOIN to find
   which city has the highest total spending.
   Hint: JOIN students + orders, GROUP BY city,
   SUM amount, ORDER BY total DESC.

4. MEDIUM: Load your smart_orders.csv into a
   SQLite database using pandas:
     df = pd.read_csv('smart_orders.csv')
     df.to_sql('orders', conn,
               if_exists='replace', index=False)
   Then query it with SQL!

5. HARD: Write a Python function that takes a
   city name as input and prints all students
   from that city with their enrolled courses.
""")
