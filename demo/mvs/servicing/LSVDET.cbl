       IDENTIFICATION DIVISION.
       PROGRAM-ID.  LSVDET.
      *****************************************************************
      * LOAN SERVICING - LSV20, THE LOAN DETAIL: THE FILE AS SERVICING*
      * HOLDS IT, AND THE KEYS THAT DECIDE IT OR ATTACH A CONDITION.  *
      * ENTERED BY XCTL FROM LSVPGM, WITH THE LOAN IN THE COMMAREA.   *
      *****************************************************************
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-COMM.
           05  CA-SCREEN               PIC XX.
           05  CA-LOAN                 PIC X(12).
           05  CA-ACTION               PIC X.
           05  FILLER                  PIC X(49).
       01  WS-RESP                     PIC S9(8) COMP.
       01  WS-USER                     PIC X(8).
       01  WS-I                        PIC S9(4) COMP.
       01  WS-J                        PIC S9(4) COMP.
       01  WS-N                        PIC S9(4) COMP.
       01  WS-FOUND                    PIC X.
       01  WS-COND                     PIC X(12).
      *
      *    THE LOAN FILE'S RECORD.
       01  LOAN-REC.
           05  LR-KEY                  PIC X(12).
           05  LR-BORROWER             PIC X(24).
           05  LR-PROGRAM              PIC X(12).
           05  LR-AMOUNT               PIC 9(9)V99.
           05  LR-RATE                 PIC 9V999.
           05  LR-LTV                  PIC 999V99.
           05  LR-DTI                  PIC 999V99.
           05  LR-FICO                 PIC 999.
           05  LR-RESERVES             PIC 99.
           05  LR-FLOOD                PIC XX.
           05  LR-PROPERTY             PIC X(24).
           05  LR-FIRST                PIC X.
           05  LR-EDUCATION            PIC X(24).
           05  LR-EMPLOYMENT           PIC X(16).
           05  LR-STATUS               PIC X(24).
           05  LR-COND                 PIC X(12) OCCURS 4.
           05  LR-ACCOUNT              PIC X(7).
           05  FILLER                  PIC X(16).
      *
      *    FIGURES AS THE SCREEN SHOWS THEM.
       01  ED-AMOUNT                   PIC ZZZ,ZZZ,ZZ9.99.
       01  ED-PCT                      PIC ZZ9.99.
       01  ED-RATE                     PIC Z9.999.
       01  ED-FICO                     PIC ZZ9.
       01  ED-RESERVES.
           05  ED-RES-N                PIC Z9.
           05  FILLER                  PIC X(4) VALUE ' MOS'.
       01  M-206.
           05  FILLER    PIC X(21) VALUE 'LSV206E LOAN ALREADY '.
           05  M-206-STATUS            PIC X(24).
      *
      *    WORDS JOINED WITH ONE SPACE, OR ", ", INTO ONE LINE.
       01  WS-BUILD.
           05  WB-CHAR                 PIC X OCCURS 80.
       01  WS-BPTR                     PIC S9(4) COMP.
       01  WS-PIECE.
           05  WP-CHAR                 PIC X OCCURS 48.
       01  WS-PLEN                     PIC S9(4) COMP.
       COPY LSVSET.
       COPY DFHAID.
       LINKAGE SECTION.
       01  DFHCOMMAREA                 PIC X(64).
       PROCEDURE DIVISION.
       0000-MAIN.
           EXEC CICS ASSIGN USERID(WS-USER) END-EXEC.
           MOVE DFHCOMMAREA TO WS-COMM.
           MOVE LOW-VALUES TO LSV20MO.
           IF CA-ACTION = 'F' GO TO 1000-SHOW.
           IF EIBAID = DFHPF3
               MOVE 'F' TO CA-ACTION
               EXEC CICS XCTL PROGRAM('LSVPGM')
                         COMMAREA(WS-COMM) LENGTH(64) END-EXEC.
           EXEC CICS READ FILE('LOANS') INTO(LOAN-REC) UPDATE
                     RIDFLD(CA-LOAN) RESP(WS-RESP)
           END-EXEC.
           IF WS-RESP NOT = DFHRESP(NORMAL) GO TO 9800-LOST.
           IF EIBAID = DFHPF5 OR EIBAID = DFHPF6
               GO TO 2000-DECIDE.
           MOVE SPACES TO WS-COND.
           IF EIBAID = DFHPF7  MOVE 'PMI'         TO WS-COND.
           IF EIBAID = DFHPF8  MOVE 'RESERVES'    TO WS-COND.
           IF EIBAID = DFHPF9  MOVE 'FLOOD INS'   TO WS-COND.
           IF EIBAID = DFHPF10 MOVE 'TAX RETURNS' TO WS-COND.
           IF WS-COND NOT = SPACES GO TO 3000-ATTACH.
           EXEC CICS UNLOCK FILE('LOANS') END-EXEC.
           GO TO 9000-SEND.
      *
       1000-SHOW.
           EXEC CICS READ FILE('LOANS') INTO(LOAN-REC)
                     RIDFLD(CA-LOAN) RESP(WS-RESP)
           END-EXEC.
           IF WS-RESP NOT = DFHRESP(NORMAL) GO TO 9800-LOST.
           GO TO 9000-SEND.
      *
       2000-DECIDE.
           IF LR-STATUS NOT = 'IN UNDERWRITING'
               GO TO 8000-ALREADY-DECIDED.
           IF EIBAID = DFHPF5
               MOVE 'APPROVED' TO LR-STATUS
               MOVE 'LSV205I LOAN APPROVED' TO M20O
           ELSE
               MOVE 'REFERRED TO SENIOR UW' TO LR-STATUS
               MOVE 'LSV208I LOAN REFERRED TO A SENIOR UNDERWRITER'
                   TO M20O.
           EXEC CICS REWRITE FILE('LOANS') FROM(LOAN-REC) END-EXEC.
           GO TO 9000-SEND.
      *
       3000-ATTACH.
           IF LR-STATUS NOT = 'IN UNDERWRITING'
               GO TO 8000-ALREADY-DECIDED.
           MOVE 'N' TO WS-FOUND.
           MOVE ZERO TO WS-N.
           PERFORM 3100-LOOK-FOR-CONDITION
               VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4.
           IF WS-FOUND = 'Y'
               EXEC CICS UNLOCK FILE('LOANS') END-EXEC
               MOVE 'LSV209E' TO WS-PIECE
               PERFORM 3200-SAY-CONDITION
               MOVE 'CONDITION ALREADY ATTACHED' TO WS-PIECE
               PERFORM 7100-APPEND-WORD
               MOVE WS-BUILD TO M20O
               GO TO 9000-SEND.
           IF WS-N = ZERO
               EXEC CICS UNLOCK FILE('LOANS') END-EXEC
               MOVE 'LSV210E NO ROOM FOR ANOTHER CONDITION' TO M20O
               GO TO 9000-SEND.
           MOVE WS-COND TO LR-COND (WS-N).
           EXEC CICS REWRITE FILE('LOANS') FROM(LOAN-REC) END-EXEC.
           MOVE 'LSV207I' TO WS-PIECE.
           PERFORM 3200-SAY-CONDITION.
           MOVE 'CONDITION ATTACHED' TO WS-PIECE.
           PERFORM 7100-APPEND-WORD.
           MOVE WS-BUILD TO M20O.
           GO TO 9000-SEND.
      *
       3100-LOOK-FOR-CONDITION.
           IF LR-COND (WS-I) = WS-COND MOVE 'Y' TO WS-FOUND.
           IF LR-COND (WS-I) = SPACES AND WS-N = ZERO
               MOVE WS-I TO WS-N.
      *
      *    A MESSAGE THAT STARTS WITH ITS CODE AND THE CONDITION.
       3200-SAY-CONDITION.
           MOVE SPACES TO WS-BUILD.
           MOVE 1 TO WS-BPTR.
           PERFORM 7100-APPEND-WORD.
           MOVE WS-COND TO WS-PIECE.
           PERFORM 7100-APPEND-WORD.
      *
       8000-ALREADY-DECIDED.
           EXEC CICS UNLOCK FILE('LOANS') END-EXEC.
           MOVE LR-STATUS TO M-206-STATUS.
           MOVE M-206 TO M20O.
           GO TO 9000-SEND.
      *
      *    APPEND WS-PIECE, WITHOUT ITS TRAILING SPACES, TO WS-BUILD,
      *    FOLLOWED BY ONE SPACE.
       7100-APPEND-WORD.
           MOVE 48 TO WS-PLEN.
           PERFORM 7110-SHORTEN
               UNTIL WS-PLEN = 0 OR WP-CHAR (WS-PLEN) NOT = SPACE.
           PERFORM 7120-COPY-CHAR
               VARYING WS-I FROM 1 BY 1 UNTIL WS-I > WS-PLEN.
           ADD 1 TO WS-BPTR.
      *
       7110-SHORTEN.
           SUBTRACT 1 FROM WS-PLEN.
      *
       7120-COPY-CHAR.
           IF WS-BPTR < 81
               MOVE WP-CHAR (WS-I) TO WB-CHAR (WS-BPTR)
               ADD 1 TO WS-BPTR.
      *
      *    THE CONDITIONS ON FILE, JOINED WITH ", ".
       7200-JOIN-CONDITION.
           IF LR-COND (WS-J) NOT = SPACES
               IF WS-BPTR > 1
                   COMPUTE WS-N = WS-BPTR - 1
                   MOVE ',' TO WB-CHAR (WS-N)
                   MOVE LR-COND (WS-J) TO WS-PIECE
                   PERFORM 7100-APPEND-WORD
               ELSE
                   MOVE LR-COND (WS-J) TO WS-PIECE
                   PERFORM 7100-APPEND-WORD.
      *
      *    THE LOAN IS NOT THERE ANY MORE: BACK TO THE INQUIRY.
       9800-LOST.
           MOVE 'F' TO CA-ACTION.
           EXEC CICS XCTL PROGRAM('LSVPGM')
                     COMMAREA(WS-COMM) LENGTH(64) END-EXEC.
      *
      *    THE LOAN IN LOAN-REC, AS THE DETAIL SCREEN SHOWS IT.
       9000-SEND.
           MOVE '20' TO CA-SCREEN.
           MOVE SPACE TO CA-ACTION.
           MOVE WS-USER TO U20O.
           MOVE LR-KEY TO DLOANO.
           MOVE LR-STATUS TO DSTATO.
           MOVE LR-BORROWER TO DBORRO.
           MOVE LR-PROGRAM TO DPROGO.
           MOVE LR-AMOUNT TO ED-AMOUNT.
           MOVE ED-AMOUNT TO DAMTO.
           MOVE LR-PROPERTY TO DPROPO.
           MOVE LR-FLOOD TO DFLOODO.
           MOVE LR-LTV TO ED-PCT.
           MOVE ED-PCT TO DLTVO.
           MOVE LR-DTI TO ED-PCT.
           MOVE ED-PCT TO DDTIO.
           MOVE LR-FICO TO ED-FICO.
           MOVE ED-FICO TO DFICOO.
           MOVE LR-RESERVES TO ED-RES-N.
           MOVE ED-RESERVES TO DRESO.
           MOVE LR-FIRST TO DFIRSTO.
           MOVE LR-EDUCATION TO DEDUCO.
           MOVE LR-EMPLOYMENT TO DEMPLO.
           MOVE LR-RATE TO ED-RATE.
           MOVE ED-RATE TO DRATEO.
           MOVE SPACES TO WS-BUILD.
           MOVE 1 TO WS-BPTR.
           PERFORM 7200-JOIN-CONDITION
               VARYING WS-J FROM 1 BY 1 UNTIL WS-J > 4.
           IF WS-BPTR = 1 MOVE 'NONE' TO WS-BUILD.
           MOVE WS-BUILD TO DCONDO.
           EXEC CICS SEND MAP('LSV20M') MAPSET('LSVSET')
                     FROM(LSV20MO) ERASE
           END-EXEC.
           EXEC CICS RETURN TRANSID('LSV1')
                     COMMAREA(WS-COMM) LENGTH(64)
           END-EXEC.
