# Database migrations

The SQL migration and files under `meta/` are generated together by Drizzle Kit. Commit all of
them so future migrations are diffed against the same schema history in every environment.

Do not hand-edit or gitignore the metadata. Change the Drizzle schema, run `pnpm --filter
@open-ui/db db:generate`, review the generated SQL, and commit the SQL, journal, and snapshot.
