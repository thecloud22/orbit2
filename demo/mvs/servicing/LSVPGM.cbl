       IDENTIFICATION DIVISION.
       PROGRAM-ID.  LSVPGM.
      *****************************************************************
      * MERIDIAN HOME LENDING - LOAN SERVICING (TRANSACTIONS LSV0,    *
      * LSV1): THE WELCOME, THE INQUIRY, AND THE WAY IN FOR EVERY KEY.*
      *                                                               *
      * THE ORBIT LOAN-SERVICING TWIN (DEMO/TERMINAL-PORTAL) AS CICS  *
      * PROGRAMS, ONE PER SCREEN: LSVPGM (LSV00, LSV10), LSVDET       *
      * (LSV20), LSVBRD (LSV40), LSVBOR (LSV50). WRITTEN TO CICS'S    *
      * OWN API SO THAT A CICS REGION COULD RUN THEM; KICKS FOR TSO   *
      * RUNS THEM HERE.                                               *
      *                                                               *
      * PSEUDO-CONVERSATIONAL: EACH KEY IS ONE TASK OF LSV1, WHICH    *
      * STARTS HERE AND IS PASSED (XCTL) TO THE PROGRAM WHOSE SCREEN  *
      * IS SHOWING. CA-ACTION 'F' ASKS A PROGRAM FOR ITS SCREEN AFRESH*
      * RATHER THAN TO HANDLE A KEY.                                  *
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
       01  WS-LOWER    PIC X(26) VALUE 'abcdefghijklmnopqrstuvwxyz'.
       01  WS-UPPER    PIC X(26) VALUE 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.
       01  LOAN-REC                    PIC X(240).
       COPY LSVSET.
       COPY DFHAID.
       LINKAGE SECTION.
       01  DFHCOMMAREA                 PIC X(64).
       PROCEDURE DIVISION.
       0000-MAIN.
           EXEC CICS ASSIGN USERID(WS-USER) END-EXEC.
      *    LSV0 IS THE FIRST TRANSACTION (THE SIT'S PLTPI): IT PAINTS
      *    THE WELCOME. UNDER TSO THE FIRST KEY AFTER KICKS STARTS
      *    ARRIVES AS PA2, WITH NOTHING TYPED AND NO COMMAREA (KICKS'S
      *    OWN KSGM IGNORES IT), SO WHATEVER COMES WITHOUT A COMMAREA
      *    OPENS THE INQUIRY.
           IF EIBCALEN = ZERO AND EIBTRNID = 'LSV0'
               GO TO 0500-WELCOME.
           IF EIBCALEN = ZERO GO TO 1000-INQUIRY-FRESH.
           MOVE DFHCOMMAREA TO WS-COMM.
           IF CA-ACTION = 'F' GO TO 1000-INQUIRY-FRESH.
           IF CA-SCREEN = '10' GO TO 1100-INQUIRY.
           IF CA-SCREEN = '20'
               EXEC CICS XCTL PROGRAM('LSVDET')
                         COMMAREA(WS-COMM) LENGTH(64) END-EXEC.
           IF CA-SCREEN = '40'
               EXEC CICS XCTL PROGRAM('LSVBRD')
                         COMMAREA(WS-COMM) LENGTH(64) END-EXEC.
           IF CA-SCREEN = '50'
               EXEC CICS XCTL PROGRAM('LSVBOR')
                         COMMAREA(WS-COMM) LENGTH(64) END-EXEC.
           GO TO 1000-INQUIRY-FRESH.
      *
       0500-WELCOME.
           MOVE LOW-VALUES TO LSV00MO.
           MOVE '00' TO CA-SCREEN.
           MOVE SPACE TO CA-ACTION.
           MOVE WS-USER TO U00O.
           EXEC CICS SEND MAP('LSV00M') MAPSET('LSVSET')
                     FROM(LSV00MO) ERASE
           END-EXEC.
           GO TO 9000-NEXT-KEY.
      *
      *    (NO GOBACK AFTER A RETURN: THE RETURN ENDS THE TASK.)
       9000-NEXT-KEY.
           EXEC CICS RETURN TRANSID('LSV1')
                     COMMAREA(WS-COMM) LENGTH(64)
           END-EXEC.
      *
      *    PF3 ON THE INQUIRY: SIGN OFF, WHICH ENDS KICKS AND THE TSO
      *    SESSION WITH IT (THE LOGON CLIST LOGS OFF AFTER KICKS).
       9900-SIGN-OFF.
           EXEC CICS SIGNOFF END-EXEC.
           EXEC CICS RETURN END-EXEC.
      *****************************************************************
      *    LSV10 - INQUIRY
      *****************************************************************
       1000-INQUIRY-FRESH.
           MOVE LOW-VALUES TO LSV10MO.
           MOVE SPACES TO CA-LOAN.
           GO TO 1900-SEND-INQUIRY.
      *
       1100-INQUIRY.
           IF EIBAID = DFHPF3 GO TO 9900-SIGN-OFF.
           MOVE 'F' TO CA-ACTION.
           IF EIBAID = DFHPF4
               EXEC CICS XCTL PROGRAM('LSVBRD')
                         COMMAREA(WS-COMM) LENGTH(64) END-EXEC.
           IF EIBAID = DFHPF6
               EXEC CICS XCTL PROGRAM('LSVBOR')
                         COMMAREA(WS-COMM) LENGTH(64) END-EXEC.
           IF EIBAID = DFHCLEAR GO TO 1000-INQUIRY-FRESH.
           EXEC CICS RECEIVE MAP('LSV10M') MAPSET('LSVSET')
                     INTO(LSV10MI) RESP(WS-RESP)
           END-EXEC.
           IF WS-RESP NOT = DFHRESP(NORMAL)
               MOVE LOW-VALUES TO LSV10MI.
           MOVE SPACES TO M10O.
           IF EIBAID NOT = DFHENTER GO TO 1900-SEND-INQUIRY.
           MOVE LOANNOI TO WS-KEY.
           EXAMINE WS-KEY REPLACING ALL LOW-VALUE BY SPACE.
           TRANSFORM WS-KEY CHARACTERS FROM WS-LOWER TO WS-UPPER.
           IF WS-KEY = SPACES
               MOVE 'LSV101E ENTER A LOAN NUMBER' TO M10O
               GO TO 1900-SEND-INQUIRY.
           EXEC CICS READ FILE('LOANS') INTO(LOAN-REC)
                     RIDFLD(WS-KEY) RESP(WS-RESP)
           END-EXEC.
           IF WS-RESP NOT = DFHRESP(NORMAL)
               MOVE 'LSV102E NO LOAN MATCHES THAT NUMBER' TO M10O
               GO TO 1900-SEND-INQUIRY.
      *    FOUND: THE DETAIL PROGRAM SHOWS IT.
           MOVE WS-KEY TO CA-LOAN.
           EXEC CICS XCTL PROGRAM('LSVDET')
                     COMMAREA(WS-COMM) LENGTH(64) END-EXEC.
      *
       1900-SEND-INQUIRY.
           MOVE '10' TO CA-SCREEN.
           MOVE SPACE TO CA-ACTION.
           MOVE WS-USER TO U10O.
           EXEC CICS SEND MAP('LSV10M') MAPSET('LSVSET')
                     FROM(LSV10MO) ERASE
           END-EXEC.
           GO TO 9000-NEXT-KEY.
