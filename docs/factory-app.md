# Factory phone app — 12 September 2026

Factory staff do four things on a phone: see what to make, record what they made,
mark who came in, and check quality. The web workspace does far more than that, and
asking someone on the floor to find their way around it is the wrong shape. So the
phone app is a separate, deliberately small Flutter app over a small JSON API.

The app holds no business rules. Every write goes through the same server action the
web form uses, so a rule only ever exists in one place: material recipes still deduct
stock, production still waits for QC, plans still cap the quantity, permissions still
apply by role.

## The API

Under `/api/mobile`, JSON in and out. It authenticates with the ordinary session token
— the same value the browser keeps in a cookie — sent as `Authorization: Bearer`.
Signing out on the phone ends that one session and nothing else.

| Route | What it does |
| --- | --- |
| `POST /api/mobile/session` | Sign in with email and password. Returns the token. Throttled like the website. |
| `GET /api/mobile/session` | Who the token belongs to. |
| `DELETE /api/mobile/session` | Sign out this phone. |
| `GET /api/mobile/home` | Everything one screen needs: open plans, products, staff with today's marks, today's entries, batches awaiting QC, low materials. |
| `POST /api/mobile/production` | Record a batch. Same action as the web dialog. |
| `POST /api/mobile/attendance` | Mark one person for one day. |
| `POST /api/mobile/qc` | Record an inspection. |

Roles are unchanged: recording production and QC needs Factory or Owner; marking
attendance needs the attendance permission. A login that lacks them gets a 403 with a
plain message rather than a blank screen.

## The app

Five screens, large type, large targets.

1. **Sign in** — email and password. The server address is editable but pre-filled, so
   nobody has to type it.
2. **Home** — today's date, three big buttons (record production, attendance, quality),
   then what is on the plan, what has been entered today, and which materials are low.
   Pull down to refresh.
3. **What we made** — pick from the plan or search for a product, set the quantity with
   plus and minus, optionally say who made it, save. The quantity cannot exceed what the
   plan has left. Products without a recipe ask for a note explaining how material use
   was recorded, exactly as the web form does.
4. **Attendance** — one row per person, four buttons: present, half day, absent, leave.
   A tap saves immediately and shows again if the save fails.
5. **Check quality** — the batches waiting, then good and rejected counts with a note.
   Good pieces enter finished stock; rejected ones do not.

Errors are shown as the server wrote them, so "Not enough MULL: only 3 metres in stock"
reaches the person who can act on it.

## Building it

The project lives outside this repository, at `~/trupath-android/flutter`, with the
signing key and notes in `~/trupath-android`. It is a plain Flutter app: `flutter build
apk --release`. Package `in.trupaths.factory`, minimum Android 5.0.

`~/trupath-android/twa` holds the earlier wrapper build of the full web workspace,
package `in.trupaths.ops`. The two can be installed side by side: the wrapper suits an
owner or accounts login that needs everything, the Flutter app suits the floor.

## Not in the app

Raw material purchases and issues, job work, dispatch, invoices, reports and settings
stay on the web. Low material stock is shown so the floor can flag it, but recording a
purchase or an issue is still a web task. There is no offline queue: an entry needs a
connection, and the app says so rather than pretending to have saved it.
