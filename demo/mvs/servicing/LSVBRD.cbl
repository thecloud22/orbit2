       IDENTIFICATION DIVISION.
       PROGRAM-ID.  LSVBRD.
      *****************************************************************
      * LOAN SERVICING - LSV40, BOARDING A NEW LOAN: CHECKED THE WAY  *
      * A SERVICING SYSTEM CHECKS IT, IN THE TWIN'S ORDER, AND GIVEN  *
      * A SERVICING ACCOUNT: 77 AND THE LOAN'S LAST FIVE DIGITS.      *
      * ENTERED BY XCTL FROM LSVPGM.                                  *
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
       01  WS-KEY                      PIC X(12).
       01  WS-NAME                     PIC X(24).
       01  WS-CODE                     PIC X(4).
       01  WS-I                        PIC S9(4) COMP.
       01  WS-LOWER    PIC X(26) VALUE 'abcdefghijklmnopqrstuvwxyz'.
       01  WS-UPPER    PIC X(26) VALUE 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.
       01  WS-ACCOUNT.
           05  WA-CHAR                 PIC X OCCURS 7.
      *
      *    THE LOAN FILE'S RECORD: ONLY THE KEY AND THE ACCOUNT MATTER.
       01  LOAN-REC.
           05  LR-KEY.
               10  LR-KC               PIC X OCCURS 12.
           05  FILLER                  PIC X(205).
           05  LR-ACCOUNT              PIC X(7).
           05  FILLER                  PIC X(16).
       01  M-405.
           05  FILLER    PIC X(40)
                   VALUE 'LSV405I LOAN BOARDED. SERVICING ACCOUNT '.
           05  M-405-ACCOUNT           PIC X(7).
       01  M-406.
           05  FILLER    PIC X(40)
                   VALUE 'LSV406E LOAN ALREADY BOARDED - ACCOUNT '.
           05  M-406-ACCOUNT           PIC X(7).
      *
      *    A FIGURE AS TYPED: $360,000.00, 6.375%.
       01  WS-TYPED.
           05  WT-CHAR                 PIC X OCCURS 12.
       01  WS-DIGIT                    PIC 9.
       01  WS-INT                      PIC 9(9).
       01  WS-FRAC                     PIC 9(3).
       01  WS-FDIGITS                  PIC S9(4) COMP.
       01  WS-POINT                    PIC X.
       01  WS-BAD                      PIC X.
       01  WS-SEEN                     PIC X.
       01  WS-VALUE                    PIC 9(9)V999.
       01  WS-MONEY                    PIC 9(9)V99.
       01  WS-RATE                     PIC 9(3)V999.
       COPY LSVSET.
       COPY DFHAID.
       LINKAGE SECTION.
       01  DFHCOMMAREA                 PIC X(64).
       PROCEDURE DIVISION.
       0000-MAIN.
           EXEC CICS ASSIGN USERID(WS-USER) END-EXEC.
           MOVE DFHCOMMAREA TO WS-COMM.
           IF CA-ACTION = 'F' OR EIBAID = DFHCLEAR
               MOVE LOW-VALUES TO LSV40MO
               GO TO 9000-SEND.
           IF EIBAID = DFHPF3
               MOVE 'F' TO CA-ACTION
               EXEC CICS XCTL PROGRAM('LSVPGM')
                         COMMAREA(WS-COMM) LENGTH(64) END-EXEC.
           EXEC CICS RECEIVE MAP('LSV40M') MAPSET('LSVSET')
                     INTO(LSV40MI) RESP(WS-RESP)
           END-EXEC.
           IF WS-RESP NOT = DFHRESP(NORMAL)
               MOVE LOW-VALUES TO LSV40MI.
           MOVE SPACES TO M40O BACCTLO BACCTO.
           IF EIBAID NOT = DFHPF10 GO TO 9000-SEND.
      *    THE CHECKS, IN THE TWIN'S ORDER.
           MOVE BLOANI TO WS-KEY.
           EXAMINE WS-KEY REPLACING ALL LOW-VALUE BY SPACE.
           TRANSFORM WS-KEY CHARACTERS FROM WS-LOWER TO WS-UPPER.
           EXEC CICS READ FILE('LOANS') INTO(LOAN-REC) UPDATE
                     RIDFLD(WS-KEY) RESP(WS-RESP)
           END-EXEC.
           IF WS-RESP NOT = DFHRESP(NORMAL)
               MOVE 'LSV401E NO LOAN MATCHES THAT NUMBER' TO M40O
               GO TO 9000-SEND.
           IF LR-ACCOUNT NOT = SPACES
               MOVE LR-ACCOUNT TO M-406-ACCOUNT
               MOVE M-406 TO M40O
               GO TO 8000-REFUSED.
           MOVE BBORRI TO WS-NAME.
           EXAMINE WS-NAME REPLACING ALL LOW-VALUE BY SPACE.
           IF WS-NAME = SPACES
               MOVE 'LSV402E ENTER THE BORROWER' TO M40O
               GO TO 8000-REFUSED.
           MOVE BAMTI TO WS-TYPED.
           PERFORM 7000-READ-FIGURE.
           MOVE WS-VALUE TO WS-MONEY.
           IF WS-BAD = 'Y' OR WS-MONEY = ZERO
               MOVE 'LSV403E AMOUNT IS NOT A NUMBER' TO M40O
               GO TO 8000-REFUSED.
           MOVE BPROGI TO WS-CODE.
           EXAMINE WS-CODE REPLACING ALL LOW-VALUE BY SPACE.
           TRANSFORM WS-CODE CHARACTERS FROM WS-LOWER TO WS-UPPER.
           IF WS-CODE NOT = 'CONV' AND WS-CODE NOT = 'FHA'
              AND WS-CODE NOT = 'VA' AND WS-CODE NOT = 'JUMB'
               MOVE 'LSV404E PROGRAM MUST BE CONV FHA VA OR JUMB'
                   TO M40O
               GO TO 8000-REFUSED.
           MOVE BRATEI TO WS-TYPED.
           PERFORM 7000-READ-FIGURE.
           MOVE WS-VALUE TO WS-RATE.
           IF WS-BAD = 'Y' OR WS-RATE < 3 OR WS-RATE > 9
               MOVE 'LSV407E NOTE RATE OUTSIDE PROGRAM RANGE' TO M40O
               GO TO 8000-REFUSED.
      *    BOARDED: THE ACCOUNT IS 77 AND THE LOAN'S LAST FIVE DIGITS.
           MOVE '77' TO WS-ACCOUNT.
           MOVE LR-KC (7)  TO WA-CHAR (3).
           MOVE LR-KC (8)  TO WA-CHAR (4).
           MOVE LR-KC (9)  TO WA-CHAR (5).
           MOVE LR-KC (10) TO WA-CHAR (6).
           MOVE LR-KC (11) TO WA-CHAR (7).
           MOVE WS-ACCOUNT TO LR-ACCOUNT.
           EXEC CICS REWRITE FILE('LOANS') FROM(LOAN-REC) END-EXEC.
           MOVE LR-ACCOUNT TO M-405-ACCOUNT.
           MOVE M-405 TO M40O.
           MOVE 'SERVICING ACCOUNT :' TO BACCTLO.
           MOVE LR-ACCOUNT TO BACCTO.
           GO TO 9000-SEND.
      *
       8000-REFUSED.
           EXEC CICS UNLOCK FILE('LOANS') END-EXEC.
           GO TO 9000-SEND.
      *
      *    WS-TYPED AS A NUMBER IN WS-VALUE: DIGITS AND ONE POINT;
      *    $ , % AND SPACES ARE IGNORED; ANYTHING ELSE SETS WS-BAD.
       7000-READ-FIGURE.
           EXAMINE WS-TYPED REPLACING ALL LOW-VALUE BY SPACE.
           MOVE ZERO TO WS-INT WS-FRAC WS-FDIGITS.
           MOVE 'N' TO WS-POINT.
           MOVE 'N' TO WS-BAD.
           MOVE 'N' TO WS-SEEN.
           PERFORM 7100-FIGURE-CHAR
               VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 12.
           IF WS-SEEN = 'N' MOVE 'Y' TO WS-BAD.
           IF WS-FDIGITS = 1 MULTIPLY 100 BY WS-FRAC.
           IF WS-FDIGITS = 2 MULTIPLY 10 BY WS-FRAC.
           COMPUTE WS-VALUE = WS-INT + WS-FRAC / 1000.
      *
       7100-FIGURE-CHAR.
           IF WT-CHAR (WS-I) = '$' OR WT-CHAR (WS-I) = ','
              OR WT-CHAR (WS-I) = '%' OR WT-CHAR (WS-I) = SPACE
               NEXT SENTENCE
           ELSE
           IF WT-CHAR (WS-I) = '.'
               IF WS-POINT = 'Y'
                   MOVE 'Y' TO WS-BAD
               ELSE
                   MOVE 'Y' TO WS-POINT
           ELSE
           IF WT-CHAR (WS-I) NOT NUMERIC
               MOVE 'Y' TO WS-BAD
           ELSE
               MOVE 'Y' TO WS-SEEN
               MOVE WT-CHAR (WS-I) TO WS-DIGIT
               IF WS-POINT = 'N'
                   COMPUTE WS-INT = WS-INT * 10 + WS-DIGIT
               ELSE
                   IF WS-FDIGITS < 3
                       COMPUTE WS-FRAC = WS-FRAC * 10 + WS-DIGIT
                       ADD 1 TO WS-FDIGITS.
      *
      *    WHAT WAS TYPED STAYS ON THE SCREEN, AS THE TWIN KEEPS IT.
       9000-SEND.
           MOVE '40' TO CA-SCREEN.
           MOVE SPACE TO CA-ACTION.
           MOVE WS-USER TO U40O.
           EXEC CICS SEND MAP('LSV40M') MAPSET('LSVSET')
                     FROM(LSV40MO) ERASE
           END-EXEC.
           EXEC CICS RETURN TRANSID('LSV1')
                     COMMAREA(WS-COMM) LENGTH(64)
           END-EXEC.
