###################
Sync
###################

Name
==================

lowrmt-sync - Synchronize files between this computer and the device

Synopsis
==================

.. code-block:: bash

    lowrmt sync [--no-transpile]

Description
==================

Will synchronize the files between the :doc:`sync folder </configuration>` on this computer and the device. The sync folder will be created if it does not exist.

If conflicts arise, the program will show all paths where conflicts exist. A conflict may be resolved by choosing which version to synchronize against (remote or local), on a path-by-path or global basis. After all conflicts are resolved, the synchronization process will begin.

All glob-like patterns specified in the exclude array of the :doc:`configuration </configuration>` will apply and those file/folders will be excluded from synchronization.

By default, all JavaScript files synced to the device will be compiled down to EcmaScript 5, so you may use many modern EcmaScript features transparently with the device.

The :code:`--no-transpile` option of this command and the (lower priority) transpile option of the :doc:`configuration </configuration>` work together to determine whether to transpile or not.

In the current version only >= EcmaScript 6 files are transpiled. No TypeScript is supported by lowrmt currently.

Turning off transpilation
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

If the integrated transpilation feature is turned off, transpilation can be done manually, but the user must specify a valid EcmaScript 5 file for the :doc:`/commands/commands/start` command.

Also, currently, in case of manual transpilation by the user, debugging in the browser IDE is only supported for compiled ES 5 files.

Options
==================

.. code-block:: bash

    --no-transpile

Disables transpilation, which is enabled by default. Overrides the transpile option of the :doc:`configuration </configuration>`.

Output
==================

Displays a summary of the files that were synchronized.

Files
==================

The command will store it's internal data in a file named *lowrmt.sync.config.json* in the current working directory. Please do not change this file manually!