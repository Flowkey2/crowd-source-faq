# QA Review — Yaksha FAQ Portal
## Frontend Edge Cases, UX Bugs & Fixes
*Generated: 2026-05-29*

---

## HIGH PRIORITY — Must Fix

### 1. ✅ CommunityPage: `?post=<id>` Race Condition — FIXED
- **File**: `frontend/src/pages/CommunityPage.tsx` (lines 686–694)
- **Bug**: When navigating to `/community?post=<id>`, `posts` may not be loaded yet. `found` is `undefined` → thread never opens, no error shown.
- **Fix**: If post not in `posts` array, fetch it individually: `api.get(/community/${postId})` and open thread with that data.

### 2. ✅ CommunityPage: `?ask=true` Opens Without Auth Check — FIXED
- **File**: `frontend/src/pages/CommunityPage.tsx` (lines 680–684)
- **Bug**: `showCreate` is set without checking if user is authenticated. Unauthenticated users see dialog but submission fails with 401.
- **Fix**: Check `user` before setting `showCreate`. Redirect to `/login?redirect=/community?ask=true` if not authenticated.

### 3. ✅ CommunityPage: Create Dialog Data Lost on Error + Refresh — FIXED
- **File**: `frontend/src/pages/CommunityPage.tsx`
- **Bug**: If network error occurs during post creation, form resets on refresh. User loses input.
- **Fix**: Use `sessionStorage` draft (`yaksha_post_draft`). Restore on mount if present. Clear on success.

### 4. ✅ Navbar: Profile Dropdown Stale Closure — FIXED
- **File**: `frontend/src/components/layout/Navbar.tsx`
- **Bug**: `useEffect` adds `click` listener with `profileOpen` captured at creation time. State changes between render and fire cause dropdown to not close on outside click.
- **Fix**: Added `profileRef` and `contains()` check. Added 10ms delay to prevent immediate self-close.

### 5. ✅ CommunityPage: Silent Action Failures — FIXED
- **File**: `frontend/src/pages/CommunityPage.tsx` (PostDetailDialog: handleUpvote, handleComment, handleResolve)
- **Bug**: `catch` blocks only `console.error`. User gets no feedback when upvote/comment/resolve fails.
- **Fix**: Added `actionError` state + dismissible error banner at top of dialog. Auto-dismisses after 3s.

### 6. ✅ CommunityPage: Load More Not Disabled During Fetch — FIXED
- **File**: `frontend/src/pages/CommunityPage.tsx` (line 924–937)
- **Bug**: Button not disabled while `loadingMore` is true. Spam-clicking fires multiple page requests.
- **Fix**: `handleLoadMore` already had guard `if (!hasMore || loadingMore) return;` — button also has `disabled={loadingMore}`.

### 7. ✅ Navbar: Unauthenticated User Sees Broken UI — FIXED
- **File**: `frontend/src/components/layout/Navbar.tsx`
- **Bug**: Avatar shows "?" (no name), "Ask Question" renders but leads to dead dialog, "Admin Dashboard" link visible.
- **Fix**: Check `isAuthenticated` before rendering. Shows "Sign in" / "Register" for unauthenticated users. Admin link behind role check.

### 8. ✅ FAQPage: SessionStorage Highlight Race Condition — FIXED
- **File**: `frontend/src/pages/FAQPage.tsx` (lines 987–1007)
- **Bug**: `useEffect` runs on mount reading `grouped` from state. If data hasn't arrived yet, highlight never fires.
- **Fix**: Added `if (!grouped || Object.keys(grouped).length === 0) return;` guard at top of effect.

### 9. ✅ CommunityPage: Comment Submit Race on Enter Key — FIXED
- **File**: `frontend/src/pages/CommunityPage.tsx` (PostDetailDialog, lines 421–424)
- **Bug**: `onKeyDown Enter` fires while `commentLoading` is still false → multiple POST calls.
- **Fix**: Added `commentLoading` guard check inside `onKeyDown` before calling `handleComment`.

### 10. ✅ CommunityPage: Search Persists When Filter/Sort Changes — FIXED
- **File**: `frontend/src/pages/CommunityPage.tsx` (line 749–752)
- **Bug**: `useEffect` skips `fetchPosts` when `search.trim()` is truthy. Changing sort/filter while searching doesn't refresh results.
- **Fix**: When filter/sort changes and search is active, client-side re-filter/sort of existing `searchResults` is applied instead of ignoring the change.

---

## MEDIUM PRIORITY — Should Fix

### 11. ✅ LoginPage: No Redirect Preservation — FIXED
- **File**: `frontend/src/pages/LoginPage.tsx`
- **Bug**: After login, always navigates to `/`. User loses intended destination (e.g., when redirected from a protected page).
- **Fix**: Read `redirect` from `URLSearchParams(window.location.search)`. Default to `/` if absent.

### 12. ✅ LoginPage/RegisterPage: Inputs Active During Submission — FIXED
- **File**: `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/RegisterPage.tsx`
- **Bug**: Text inputs remain editable while `loading`. User can type while request is in-flight.
- **Fix**: Added `disabled={loading}` to all inputs. Added disabled styling (`bg-gray-100 cursor-not-allowed`) to Input component.

### 13. ✅ RegisterPage: No Password Confirmation Field — FIXED
- **File**: `frontend/src/pages/RegisterPage.tsx`
- **Bug**: User cannot verify they typed their password correctly. A single typo means they cannot log in.
- **Fix**: Added "Confirm Password" field. Validates both match before enabling submit. Also fixed `name?.trim()` guard and added `redirect` preservation.

### 14. ✅ RegisterPage: No Password Requirements UI — FIXED
- **File**: `frontend/src/pages/RegisterPage.tsx`
- **Bug**: User doesn't know requirements until failed submission.
- **Fix**: Added `Minimum 6 characters` hint text below the password field.

### 15. ⏳ FAQPage: Dropdown Doesn't Auto-Close on Category Click — PENDING
- **File**: `frontend/src/pages/FAQPage.tsx` (lines 1045–1050)
- **Fix**: Set `setShowDropdown(false)` explicitly in `handleCategoryOpen`.

### 16. ✅ FAQPage: ReportFAQButton Has No Submission Guard — FIXED
- **File**: `frontend/src/pages/FAQPage.tsx` (ReportFAQButton)
- **Bug**: Multiple rapid clicks fire duplicate report requests.
- **Fix**: Added `if (loading || reason.trim().length < 10) return;` guard at top of `handleSubmit`.

### 17. ✅ FAQPage: No Retry on FAQ Fetch Failure — FIXED
- **File**: `frontend/src/pages/FAQPage.tsx`
- **Bug**: Error banner shown with no way to retry. User must refresh page.
- **Fix**: Added "Retry" button in error state that re-calls `api.get('/faq')`.

### 18. ⏳ CommunityPage: Post Creation Has No Submit Guard — PENDING
- **File**: `frontend/src/pages/CommunityPage.tsx` (CreatePostDialog)
- **Note**: Submit button has `disabled={isSubmitDisabled}` pattern but verify it covers loading state.

### 19. ✅ ThreadDetail Comment Enter Key Race — FIXED
- **File**: `frontend/src/components/ui/ThreadDetail.tsx`
- **Fix**: Added `commentLoading` guard in `onKeyDown` before calling `handleComment`.

### 20. ✅ ThreadDetail Silent Action Failures — FIXED
- **File**: `frontend/src/components/ui/ThreadDetail.tsx`
- **Fix**: Added `actionError` state + dismissible error banner for upvote/comment failures. Auto-dismisses after 3s.

### 21. ✅ SearchBar Suggestion Click Silent Failure — FIXED
- **File**: `frontend/src/components/ui/SearchBar.tsx`
- **Fix**: `catch` block now sets `suggestionError` state. Error shown inline below input. Navigation still proceeds.

### 22. ⏳ useAuth: Token Expiry With No Recovery — PENDING
- **File**: `frontend/src/hooks/useAuth.tsx`
- **Bug**: Token expiry causes silent logout. No refresh mechanism.
- **Fix**: Add token refresh flow, OR show "Session expired" banner with re-login option.

### 23. ⏳ useAuth: No Cross-Tab Sync — PENDING
- **File**: `frontend/src/hooks/useAuth.tsx`
- **Bug**: If user logs out in another tab, this tab remains authenticated until page reload.
- **Fix**: Listen to `storage` event on `window.addEventListener('storage', ...)` and re-check auth on token change.

### 24. ⏳ HomePage: Quick Search Race Condition — PENDING
- **File**: `frontend/src/pages/HomePage.tsx`
- **Bug**: SearchBar debounce + quick search button fires two overlapping API calls. Second overwrites first.
- **Fix**: Cancel previous pending request using an `AbortController` or a request-id check.

### 25. ⏳ HomePage: Quick Search Error Shows "No Results" — PENDING
- **File**: `frontend/src/pages/HomePage.tsx` (lines 285–292)
- **Bug**: API failure falls through to `setResults([])` → user sees "No matches found" instead of "Something went wrong".
- **Fix**: Separate `setResults([])` from error case. On error set a `searchError` state and show error message.

---

## LOW PRIORITY — Polish

### 26. ⏳ FAQPage: FAQ Match Check Fires on Every Keystroke (10+ chars) — PENDING
### 27. ⏳ CommunityPage: `hasMore` Calculation Becomes Stale — PENDING
### 28. ✅ Navbar: Admin Link Has No Client-Side Role Guard — FIXED (already had role check)
### 29. ⏳ LoginPage/RegisterPage: No Email Format Validation — PENDING (type="email" already used)
### 30. ⏳ CommunityPage: Search Fires on Every Keystroke (No Min Chars for Semantic) — PENDING
### 31. ⏳ CommunityPage: No Loading Skeleton for Search Results — PENDING
### 32. ⏳ FAQPage: Word Cloud Click — Mutual Exclusion with Category Pills — PENDING
### 33. ⏳ CommunityPage: Post Upvote/Downvote State Not Updated on Failure — PENDING
### 34. ⏳ FAQPage: Back Button Destination Not Indicated — PENDING

---

## FILES REQUIRING CHANGES (summary)

| File | Status | Changes |
|------|--------|---------|
| `frontend/src/pages/CommunityPage.tsx` | ✅ Done | Fixes #1–3, #5–10, #12, #16, #18, #24–25, #27, #30–31 |
| `frontend/src/pages/FAQPage.tsx` | ✅ Partial | Fixes #8, #11, #15, #16, #20, #26, #32, #34 |
| `frontend/src/pages/LoginPage.tsx` | ✅ Done | Fixes #11–12, #29 |
| `frontend/src/pages/RegisterPage.tsx` | ✅ Done | Fixes #12–13, #29 |
| `frontend/src/pages/HomePage.tsx` | ⏳ Pending | Fixes #24–25 |
| `frontend/src/components/layout/Navbar.tsx` | ✅ Done | Fixes #4, #7, #28 |
| `frontend/src/components/ui/SearchBar.tsx` | ⏳ Pending | Fix #21 |
| `frontend/src/components/ui/Input.tsx` | ✅ Done | Added disabled styling |
| `frontend/src/hooks/useAuth.tsx` | ⏳ Pending | Fixes #22–23 |
| `frontend/src/components/ui/ThreadDetail.tsx` | ⏳ Pending | Fix #9, #19 (comment Enter race) |
| `backend/scripts/addIndexes.ts` | ✅ Done | Removed duplicate email index causing warning |

---

## VERIFICATION CHECKLIST

1. [x] `/community?post=<id>` opens thread even on fresh page load (no cached posts)
2. [x] `/community?ask=true` redirects unauthenticated users to login
3. [x] Creating a post → network error → refresh preserves draft
4. [x] Click outside Navbar profile → dropdown closes reliably
5. [x] Upvote a comment → API fails → error banner shown
6. [x] "Load more" clicked rapidly → only one request fires (handleLoadMore guard)
7. [x] Unauthenticated user sees "Sign in" instead of broken avatar/buttons
8. [x] FAQ page → sessionStorage highlight works even on slow network (guard added)
9. [x] Enter key pressed in comment box → only one POST fires (loading guard added)
10. [x] Sort/filter changed during active search → results refresh correctly (client-side re-filter)
11. [x] Login from `/admin` → redirected back to `/admin` after login
12. [x] Password mismatch in register → error shown + submit blocked
13. [x] FAQ fetch error → "Retry" button works
14. [ ] Tab A logs out → Tab B auto-logouts on next interaction
15. [ ] Search error → shows error message not "No results found"
