       IDENTIFICATION DIVISION.
       PROGRAM-ID.  LSVBOR.
      *****************************************************************
      * LOAN SERVICING - LSV50, A BORROWER'S EXISTING LOANS WITH US:  *
      * HOW MANY, THE WORST DAYS PAST DUE, AND EACH ACCOUNT.          *
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
       01  WS-NAME                     PIC X(24).
       01  WS-I                        PIC S9(4) COMP.
       01  WS-WORST                    PIC S9(4) COMP.
       01  WS-LOWER    PIC X(26) VALUE 'abcdefghijklmnopqrstuvwxyz'.
       01  WS-UPPER    PIC X(26) VALUE 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.
      *
      *    THE EXISTING-LOANS FILE'S RECORD.
       01  EXIST-REC.
           05  XR-KEY                  PIC X(24).
           05  XR-COUNT                PIC 9.
           05  XR-LOAN OCCURS 3.
               10  XR-ACCOUNT          PIC X(7).
               10  XR-TYPE             PIC X(8).
               10  XR-BALANCE          PIC 9(7)V99.
               10  XR-DPD              PIC 999.
           05  FILLER                  PIC X(134).
       01  ED-COUNT                    PIC 9.
       01  ED-DPD                      PIC ZZ9.
       01  ED-LINE.
           05  EL-ACCOUNT              PIC X(7).
           05  FILLER                  PIC X(3) VALUE SPACES.
           05  EL-TYPE                 PIC X(8).
           05  EL-BALANCE              PIC ZZ,ZZ9.99.
           05  FILLER                  PIC X(5) VALUE SPACES.
           05  EL-DPD                  PIC ZZ9.
           05  FILLER                  PIC X(10) VALUE SPACES.
       COPY LSVSET.
       COPY DFHAID.
       LINKAGE SECTION.
       01  DFHCOMMAREA                 PIC X(64).
       PROCEDURE DIVISION.
       0000-MAIN.
           EXEC CICS ASSIGN USERID(WS-USER) END-EXEC.
           MOVE DFHCOMMAREA TO WS-COMM.
           IF CA-ACTION = 'F' OR EIBAID = DFHCLEAR
               MOVE LOW-VALUES TO LSV50MO
               GO TO 9000-SEND.
           IF EIBAID = DFHPF3
               MOVE 'F' TO CA-ACTION
               EXEC CICS XCTL PROGRAM('LSVPGM')
                         COMMAREA(WS-COMM) LENGTH(64) END-EXEC.
           EXEC CICS RECEIVE MAP('LSV50M') MAPSET('LSVSET')
                     INTO(LSV50MI) RESP(WS-RESP)
           END-EXEC.
           IF WS-RESP NOT = DFHRESP(NORMAL)
               MOVE LOW-VALUES TO LSV50MI.
           MOVE SPACES TO M50O XCNTLO XCNTO XWORSTLO XWORSTO XHEADO.
           MOVE SPACES TO XLINE1O XLINE2O XLINE3O.
           IF EIBAID NOT = DFHENTER GO TO 9000-SEND.
           MOVE XBORRI TO WS-NAME.
           EXAMINE WS-NAME REPLACING ALL LOW-VALUE BY SPACE.
           TRANSFORM WS-NAME CHARACTERS FROM WS-LOWER TO WS-UPPER.
           IF WS-NAME = SPACES
               MOVE 'LSV501E ENTER A BORROWER NAME' TO M50O
               GO TO 9000-SEND.
           MOVE WS-NAME TO XBORRO.
           EXEC CICS READ FILE('EXIST') INTO(EXIST-REC)
                     RIDFLD(WS-NAME) RESP(WS-RESP)
           END-EXEC.
           IF WS-RESP NOT = DFHRESP(NORMAL)
               MOVE ZERO TO XR-COUNT
               MOVE 'LSV502I NO EXISTING LOANS WITH US' TO M50O.
           MOVE 'ACCOUNTS WITH US    :' TO XCNTLO.
           MOVE XR-COUNT TO ED-COUNT.
           MOVE ED-COUNT TO XCNTO.
           MOVE 'WORST DAYS PAST DUE :' TO XWORSTLO.
           MOVE ZERO TO WS-WORST.
           PERFORM 1000-WORST
               VARYING WS-I FROM 1 BY 1 UNTIL WS-I > XR-COUNT.
           MOVE WS-WORST TO ED-DPD.
           MOVE ED-DPD TO XWORSTO.
           MOVE 'ACCOUNT   TYPE    BALANCE       DAYS PAST DUE'
               TO XHEADO.
           IF XR-COUNT > 0
               MOVE 1 TO WS-I
               PERFORM 2000-LINE
               MOVE ED-LINE TO XLINE1O.
           IF XR-COUNT > 1
               MOVE 2 TO WS-I
               PERFORM 2000-LINE
               MOVE ED-LINE TO XLINE2O.
           IF XR-COUNT > 2
               MOVE 3 TO WS-I
               PERFORM 2000-LINE
               MOVE ED-LINE TO XLINE3O.
           GO TO 9000-SEND.
      *
       1000-WORST.
           IF XR-DPD (WS-I) > WS-WORST MOVE XR-DPD (WS-I) TO WS-WORST.
      *
       2000-LINE.
           MOVE XR-ACCOUNT (WS-I) TO EL-ACCOUNT.
           MOVE XR-TYPE (WS-I) TO EL-TYPE.
           MOVE XR-BALANCE (WS-I) TO EL-BALANCE.
           MOVE XR-DPD (WS-I) TO EL-DPD.
      *
       9000-SEND.
           MOVE '50' TO CA-SCREEN.
           MOVE SPACE TO CA-ACTION.
           MOVE WS-USER TO U50O.
           EXEC CICS SEND MAP('LSV50M') MAPSET('LSVSET')
                     FROM(LSV50MO) ERASE
           END-EXEC.
           EXEC CICS RETURN TRANSID('LSV1')
                     COMMAREA(WS-COMM) LENGTH(64)
           END-EXEC.
