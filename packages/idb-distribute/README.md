

# TODO
- [x] Autoincrementing id's probably does not work since 
    different clients could possibly write the same id,
    syncing would override the value resulting in lost data.
    The data will be consistent but not correct
    One approach to fix this would be to disable this functionality
- [x] Consistent order of tx and other args
    Some do fn(tx, value) and some fn(value, tx)
- [ ] Support for transaction methods
- [ ] Support for cursor.
    This would include store.index and store.index.openCursor
        - Put,set,delete,update
- [x]  Fix error when objectStore does not have a keyPath
    First step done, key is sent along with the wal entry
    Left todo is, remove keypath on user/post in helpers
    Add explicit key set in index.db
    Pass key to put event in applyPendingEntries only 
        if there is no keypath on the store

- Fix error with typing in put/del methods in db.ts
    See TODO comments inline for more information


To proxy:
- [x] db.add()
- [x] db.put() 
- [x] db.delete() 
- [x] db.clear() 

- [x] db.transaction(..).objectStore(..).add() 
- [x] db.transaction(..).store.add() 

- [x] db.transaction(..).objectStore(..).put() 
- [x] db.transaction(..).store.put() 

- [x] db.transaction(..).objectStore(..).delete() 
- [x] db.transaction(..).store.delete() 

- [x] db.transaction(..).objectStore(..).clear() 
- [x] db.transaction(..).store.clear() 

- [-] db.transaction(..).objectStore(..).openCursor(..).update() 
- [-] db.transaction(..).store.openCursor(..).update() 

- [-] db.transaction(..).objectStore(..).openCursor(..).delete() 
- [-] db.transaction(..).store.openCursor(..).delete() 

- [-] db.transaction(..).objectStore(..).openKeyCursor(..).delete() 
- [-] db.transaction(..).store.openKeyCursor(..).delete()

- [-] db.transaction(..).objectStore(..).index(..).openCursor().update()
- [-] db.transaction(..).store.index(..).openCursor().update()

- [-] db.transaction(..).objectStore(..).index(..).openCursor().delete()
- [-] db.transaction(..).store.index(..).openCursor().delete()

- [-] db.transaction(..).objectStore(..).index(..).openKeyCursor().delete()
- [-] db.transaction(..).store.index(..).openKeyCursor().delete()
