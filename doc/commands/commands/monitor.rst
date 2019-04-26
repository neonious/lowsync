###################
Monitor
###################

Name
==================

lowsync-monitor - Read from stdout of the running program

Synopsis
==================

.. code-block:: bash

    lowsync monitor [--restart[=<true | false>]] [--global]

Description
==================

Displays the output of the running program in real-time, plus timestamp. The output is colored according to the severity of the output (e.g. if program uses console.error).

Options
==================

.. code-block:: bash

    --restart
    --restart=true
    --restart=false

Enable/disable restarting the running program before monitor.

.. code-block:: bash

    --global

Show all output, not just from the currently running program.

Output
==================

Displays the output of the running program.