       IDENTIFICATION DIVISION.
       PROGRAM-ID.  LSVLOAD.
      *****************************************************************
      * LOAN SERVICING - LOAD: THREE 80-COLUMN CARDS MAKE ONE 240-BYTE*
      * RECORD, FOR IDCAMS TO REPRO INTO A KSDS. A BATCH PROGRAM, RUN *
      * EACH TIME THE FILES ARE LOADED (COBUCG). KICKS'S STKCARDS DOES*
      * THE SAME BUT DROPS A BLANK IN COLUMN 80, WHICH SHIFTS THE REST*
      * OF THE RECORD; A COBOL FIXED-LENGTH RECORD KEEPS EVERY BYTE.  *
      *****************************************************************
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT CARDS ASSIGN TO UT-S-CARDS.
           SELECT RECS  ASSIGN TO UT-S-RECS.
       DATA DIVISION.
       FILE SECTION.
       FD  CARDS
           LABEL RECORDS ARE OMITTED
           RECORDING MODE IS F
           RECORD CONTAINS 80 CHARACTERS.
       01  CARD                        PIC X(80).
       FD  RECS
           LABEL RECORDS ARE STANDARD
           RECORDING MODE IS F
           RECORD CONTAINS 240 CHARACTERS.
       01  REC.
           05  PART                    PIC X(80) OCCURS 3.
       WORKING-STORAGE SECTION.
       77  N                           PIC 9 VALUE ZERO.
       PROCEDURE DIVISION.
       0000-MAIN.
           OPEN INPUT CARDS OUTPUT RECS.
       1000-NEXT-CARD.
           READ CARDS AT END GO TO 9000-DONE.
           ADD 1 TO N.
           MOVE CARD TO PART (N).
           IF N = 3
               WRITE REC
               MOVE ZERO TO N.
           GO TO 1000-NEXT-CARD.
       9000-DONE.
           CLOSE CARDS RECS.
           STOP RUN.
